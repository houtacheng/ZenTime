"""Hide the X11 cursor while the dedicated ZenTime browser is running."""

import ctypes as c
import os
import select
import sys


def bind(lib, name, result, *args):
    function = getattr(lib, name)
    function.restype = result
    function.argtypes = args
    return function


def main(pid):
    x11 = c.CDLL("libX11.so.6")
    fixes = c.CDLL("libXfixes.so.3")
    pointer = c.c_void_p
    window = c.c_ulong
    with_pid = os.pidfd_open(pid)
    try:
        display = bind(x11, "XOpenDisplay", pointer, c.c_char_p)(None)
        if not display:
            raise RuntimeError("cannot connect to the X11 display")
        try:
            major, minor = c.c_int(4), c.c_int(0)
            query = bind(fixes, "XFixesQueryVersion", c.c_int, pointer,
                         c.POINTER(c.c_int), c.POINTER(c.c_int))
            if not query(display, c.byref(major), c.byref(minor)) or major.value < 4:
                raise RuntimeError("XFixes 4 or later is required")
            root = bind(x11, "XDefaultRootWindow", window, pointer)(display)
            bind(fixes, "XFixesHideCursor", None, pointer, window)(display, root)
            bind(x11, "XSync", c.c_int, pointer, c.c_int)(display, 0)
            print("ZenTime: X11 cursor hidden", flush=True)
            select.select([with_pid], [], [])
        finally:
            # Closing this client removes only its own cursor-hide request.
            bind(x11, "XCloseDisplay", c.c_int, pointer)(display)
    finally:
        os.close(with_pid)


if __name__ == "__main__":
    try:
        main(int(sys.argv[1]))
    except (OSError, RuntimeError) as error:
        sys.exit(f"ZenTime: {error}")
