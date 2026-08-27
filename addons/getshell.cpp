#include <node_api.h>

extern "C" {

#include <stdio.h>
#include <string.h>

#ifdef __APPLE__
#include <sys/sysctl.h>
#endif

#ifdef _WIN32
#include <windows.h>
#include <tlhelp32.h>

typedef DWORD pid_t;

#else
#include <unistd.h>
#include <sys/types.h>
#endif

static int getProcess(pid_t pid, char *out, size_t size) {
#ifdef __linux__

    char path[64];
    snprintf(path, sizeof(path), "/proc/%d/comm", pid);

    FILE *f = fopen(path, "r");
    if (!f)
        return -1;

    if (!fgets(out, size, f)) {
        fclose(f);
        return -1;
    }

    fclose(f);

    out[strcspn(out, "\n")] = '\0';
    return 0;


#elif defined(__APPLE__)
    struct kinfo_proc kp;
    size_t len = sizeof(kp);

    int mib[4] = {
        CTL_KERN,
        KERN_PROC,
        KERN_PROC_PID,
        pid
    };

    // #########
    if (sysctl(mib, 4, &kp, &len, NULL, 0) == -1)
        return -1;

    if (len == 0)
        return -1;
    // #########


    strncpy(out, kp.kp_proc.p_comm, size);
    out[size - 1] = '\0';
    return 0;

#elif defined(_WIN32)
    DWORD current_pid = GetCurrentProcessId();
    DWORD parent_pid = 0;

    HANDLE snapshot = CreateToolhelp32Snapshot(
        TH32CS_SNAPPROCESS,
        0
    );

    if (snapshot == INVALID_HANDLE_VALUE)
        return -1;

    PROCESSENTRY32 pe;
    pe.dwSize = sizeof(PROCESSENTRY32);

    if (!Process32First(snapshot, &pe)) {
        CloseHandle(snapshot);
        return -1;
    }

    do {
        if (pe.th32ProcessID == current_pid) {
            parent_pid = pe.th32ParentProcessID;
            break;
        }
    } while (Process32Next(snapshot, &pe));

    CloseHandle(snapshot);

    if (parent_pid == 0)
        return -1;


    snapshot = CreateToolhelp32Snapshot(
        TH32CS_SNAPPROCESS,
        0
    );

    if (snapshot == INVALID_HANDLE_VALUE)
        return -1;

    if (!Process32First(snapshot, &pe)) {
        CloseHandle(snapshot);
        return -1;
    }

    do {
        if (pe.th32ProcessID == parent_pid) {
            strncpy(out, pe.szExeFile, size);
            out[size - 1] = '\0';

            CloseHandle(snapshot);
            return 0;
        }


    } while (Process32Next(snapshot, &pe));

    CloseHandle(snapshot);

    return -1;

#else

    return -1;

#endif
}


char *getShell(void) {
    static char name[256];

#ifdef _WIN32
    pid_t parent = 0;
#else
    pid_t parent = getppid();
#endif

    if (getProcess(parent, name, sizeof(name)) != 0)
        return NULL;

    return name;
}


napi_value GetShellJS(napi_env env, napi_callback_info info) {
    char *name = getShell();
    napi_value result;

    if (name) {
        napi_create_string_utf8(env, name, NAPI_AUTO_LENGTH, &result);
    } else {
        napi_create_string_utf8(env, "Unknown", NAPI_AUTO_LENGTH, &result);
    }
    return result;
}

napi_value Init(napi_env env, napi_value exports) {
    napi_value fn;
    napi_create_function(env, "getShell", NAPI_AUTO_LENGTH, GetShellJS, NULL, &fn);
    napi_set_named_property(env, exports, "getShell", fn);
    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)

}
