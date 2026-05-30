import mimetypes
import os
from pathlib import Path
import shutil
import socket
import sys
import threading
import time
from urllib.error import URLError
from urllib.request import urlopen
import webbrowser


APP_TITLE = "Kasir Shanti Catering"
HOST = "127.0.0.1"
PREFERRED_PORT = 4174


def app_root():
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS")).resolve()
    return Path(__file__).resolve().parent


def user_data_dir():
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA")
        if base:
            return Path(base) / APP_TITLE
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / APP_TITLE
    return Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share")) / "kasir-shanti-catering"


def prepare_database():
    override_db_path = os.environ.get("KASIR_DB_PATH")
    if override_db_path:
        db_path = Path(override_db_path).expanduser().resolve()
        db_path.parent.mkdir(parents=True, exist_ok=True)
        os.environ["KASIR_DB_PATH"] = str(db_path)
        return db_path

    data_dir = user_data_dir()
    data_dir.mkdir(parents=True, exist_ok=True)

    db_path = data_dir / "kasir-bento.sqlite3"
    bundled_db_path = app_root() / "kasir-bento.sqlite3"
    if not db_path.exists() and bundled_db_path.exists():
        shutil.copy2(bundled_db_path, db_path)

    os.environ["KASIR_DB_PATH"] = str(db_path)
    return db_path


prepare_database()

import server as cashier_server  # noqa: E402


def port_is_available(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind((HOST, port))
        except OSError:
            return False
    return True


def choose_port():
    if port_is_available(PREFERRED_PORT):
        return PREFERRED_PORT

    for port in range(4175, 4200):
        if port_is_available(port):
            return port

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((HOST, 0))
        return sock.getsockname()[1]


def wait_until_ready(port):
    health_url = f"http://{HOST}:{port}/api/health"
    for _ in range(80):
        try:
            with urlopen(health_url, timeout=0.25) as response:
                if response.status == 200:
                    return
        except (OSError, URLError):
            time.sleep(0.1)
    raise RuntimeError("Server kasir belum siap dibuka.")


def start_server():
    cashier_server.init_database()
    mimetypes.add_type("application/manifest+json", ".webmanifest")
    port = choose_port()
    cashier_server.ThreadingHTTPServer.allow_reuse_address = True
    httpd = cashier_server.ThreadingHTTPServer((HOST, port), cashier_server.CashierHandler)
    thread = threading.Thread(target=httpd.serve_forever, name="kasir-http-server", daemon=True)
    thread.start()
    wait_until_ready(port)
    return httpd, f"http://{HOST}:{port}/"


def open_desktop_window(url):
    try:
        import webview
    except ImportError:
        webbrowser.open(url)
        print("PyWebView belum terpasang. App dibuka lewat browser sebagai fallback.")
        print("Untuk desktop window: python -m pip install -r requirements-desktop.txt")
        try:
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            return

    storage_path = user_data_dir() / "webview"
    storage_path.mkdir(parents=True, exist_ok=True)
    webview.create_window(
        APP_TITLE,
        url,
        width=1280,
        height=820,
        min_size=(1024, 700),
        confirm_close=True,
    )
    webview.start(debug=False, private_mode=False, storage_path=str(storage_path))


def main():
    httpd, url = start_server()
    print(f"{APP_TITLE} siap di {url}")
    print(f"Database: {cashier_server.DB_PATH}")
    try:
        open_desktop_window(url)
    finally:
        httpd.shutdown()
        httpd.server_close()


if __name__ == "__main__":
    main()
