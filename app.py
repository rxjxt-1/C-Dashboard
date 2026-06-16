import sys
import os
import threading
import time
import datetime
import json
import socket
import urllib.request
import webbrowser
import winreg

# Hide console windows on start
if sys.stdout is None: sys.stdout = open(os.devnull, 'w')
if sys.stderr is None: sys.stderr = open(os.devnull, 'w')

import psutil
import speedtest
import webview
import pystray
from PIL import Image, ImageDraw

def resource_path(relative_path):
    try: base_path = sys._MEIPASS
    except Exception: base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

DATA_FILE = "c_dashboard_data.json"

def load_data():
    default_data = {
        "plan_limit_gb": 1000.0, 
        "total_used": 0.0, 
        "last_psutil": 0.0, 
        "monthly_reset_day": 1,
        "daily_reset_time": "00:00",
        "last_reset_month": datetime.datetime.now().month,
        "last_reset_day": datetime.datetime.now().day,
        "speed_history": [],
        "daily_usage": {},
        "theme": "liquid",
        "run_on_startup": False,
        "alerts_triggered": {"80": False, "90": False, "100": False}
    }
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, 'r') as f:
                data = json.load(f)
                for key in default_data:
                    if key not in data: data[key] = default_data[key]
                return data
        except: pass
    return default_data

def save_data(data):
    try:
        with open(DATA_FILE, 'w') as f: json.dump(data, f)
    except: pass

saved_data = load_data()
window = None
tray_icon = None

# Network state tracking variables
is_internet_down = False
consecutive_fails = 0

# ----------------- TRAY ICON LOGIC -----------------
def create_image():
    icon_path = resource_path("DASH.png")
    if os.path.exists(icon_path):
        return Image.open(icon_path)
    image = Image.new('RGB', (64, 64), color=(0, 0, 0))
    d = ImageDraw.Draw(image)
    d.ellipse((16, 16, 48, 48), fill=(8, 131, 149))
    return image

def show_window(icon, item):
    if window: window.show()

def setup_tray():
    global tray_icon
    menu = pystray.Menu(pystray.MenuItem('Show Dashboard', show_window, default=True))
    tray_icon = pystray.Icon("CDashboard", create_image(), "C - Dashboard", menu)
    tray_icon.run()

def notify_user(title, message):
    if tray_icon:
        try: tray_icon.notify(message, title)
        except: pass

# ----------------- STARTUP LOGIC -----------------
def set_startup(enabled):
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", 0, winreg.KEY_SET_VALUE)
        if enabled:
            winreg.SetValueEx(key, "CDashboard", 0, winreg.REG_SZ, sys.argv[0])
        else:
            winreg.DeleteValue(key, "CDashboard")
        winreg.CloseKey(key)
    except Exception as e:
        print("Startup Registry Error:", e)

# ----------------- PYWEBVIEW API -----------------
class Api:
    def __init__(self):
        self.last_net_io = psutil.net_io_counters()
        self.last_time = datetime.datetime.now()

    def get_system_info(self):
        hostname = socket.gethostname()
        ip_address = "127.0.0.1"
        conn_type = "Offline"
        global is_internet_down, consecutive_fails
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip_address = s.getsockname()[0]
            s.close()
            is_internet_down = False
            consecutive_fails = 0
        except:
            pass # Handled in the polling loop more carefully

        try:
            for iface, stat in psutil.net_if_stats().items():
                if stat.isup and "loopback" not in iface.lower():
                    addrs = psutil.net_if_addrs().get(iface, [])
                    if any(a.address == ip_address for a in addrs):
                        conn_type = "Wi-Fi" if "wi-fi" in iface.lower() or "wireless" in iface.lower() else "Ethernet"
                        break
        except: pass
        return {"hostname": hostname, "ip": ip_address, "conn": conn_type, "theme": saved_data["theme"]}

    def open_creator_link(self):
        webbrowser.open("https://guns.lol/rxjxt")

    def minimize_app(self):
        if window: window.hide()
        notify_user("Minimized to Tray", "C - Dashboard is monitoring your network in the background.")

    def confirm_close(self):
        save_data(saved_data)
        if tray_icon: tray_icon.stop()
        if window: window.destroy()
        os._exit(0)

    def check_for_updates(self):
        # Background thread me check karega taaki app freeze na ho
        threading.Thread(target=self._real_update_check, daemon=True).start()

    def _real_update_check(self):
        try:
            repo = "rxjxt-1/C-Dashboard"  # Tera exact GitHub username aur repo
            current_version = "v3.0.0"
            
            url = f"https://api.github.com/repos/{repo}/releases/latest"
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            
            with urllib.request.urlopen(req, timeout=5) as response:
                data = json.loads(response.read().decode())
                latest_version = data.get("tag_name", "")
                download_url = data.get("html_url", "") 
                
                if latest_version and latest_version != current_version:
                    msg = f"Update {latest_version} Available!"
                    if window: window.evaluate_js(f'update_check_result("{msg}", "{download_url}")')
                else:
                    if window: window.evaluate_js('update_check_result("You are on the latest version!", "")')
        except Exception as e:
            print("Update check failed:", e)
            if window: window.evaluate_js('update_check_result("Failed to check for updates.", "")')

    def _simulate_update_check(self):
        time.sleep(2)
        if window: window.evaluate_js('update_check_result("You are on the latest version!")')

    def save_all_settings(self, limit, used, theme, startup, m_reset, d_reset):
        global saved_data
        saved_data["plan_limit_gb"] = float(limit)
        saved_data["theme"] = theme
        saved_data["monthly_reset_day"] = int(m_reset)
        saved_data["daily_reset_time"] = d_reset
        
        if saved_data["run_on_startup"] != startup:
            saved_data["run_on_startup"] = startup
            set_startup(startup)

        if used is not None and float(used) >= 0:
            saved_data["total_used"] = float(used)
            net_io = psutil.net_io_counters()
            saved_data["last_psutil"] = (net_io.bytes_sent + net_io.bytes_recv) / (1024**3)
            saved_data["alerts_triggered"] = {"80": False, "90": False, "100": False}
            
        save_data(saved_data)

    def get_settings(self):
        return saved_data

    def get_stats(self):
        return saved_data["daily_usage"]

    def get_speed_history(self):
        global saved_data
        return saved_data.get("speed_history", [])

    def fetch_servers(self):
        threading.Thread(target=self._fetch_servers_logic, daemon=True).start()

    def _fetch_servers_logic(self):
        try:
            try: st = speedtest.Speedtest(secure=False)
            except: st = speedtest.Speedtest()
            servers_dict = st.get_servers()
            server_list = [{"id": srv["id"], "name": f"{srv['sponsor']} ({srv['name']}) - {dist:.0f}km"} for dist, srv_list in servers_dict.items() for srv in srv_list]
            if window: window.evaluate_js(f'populate_servers({json.dumps(server_list[:50])})')
        except Exception: pass

    def get_all_data(self):
        global saved_data, is_internet_down, consecutive_fails
        now = datetime.datetime.now()
        
        if now.day == saved_data["monthly_reset_day"] and saved_data["last_reset_month"] != now.month:
            saved_data["total_used"] = 0.0
            saved_data["last_reset_month"] = now.month
            saved_data["alerts_triggered"] = {"80": False, "90": False, "100": False}
            
        current_time_str = now.strftime("%H:%M")
        if current_time_str == saved_data["daily_reset_time"] and saved_data["last_reset_day"] != now.day:
            saved_data["last_reset_day"] = now.day
            
        today_str = now.strftime("%Y-%m-%d")
        if today_str not in saved_data["daily_usage"]:
            saved_data["daily_usage"][today_str] = 0.0
            
        # Robust Outage Check (3-strike system)
        try:
            socket.create_connection(("8.8.8.8", 53), timeout=2).close()
            consecutive_fails = 0
            if is_internet_down:
                notify_user("Connection Restored", "Internet is back online.")
                is_internet_down = False
        except:
            consecutive_fails += 1
            if consecutive_fails >= 3 and not is_internet_down:
                notify_user("Internet Outage", "Network disconnected!")
                is_internet_down = True

        net_io = psutil.net_io_counters()
        time_delta = (now - self.last_time).total_seconds()
        if time_delta <= 0.0: time_delta = 0.001 
        
        dl_bps = ((net_io.bytes_recv - self.last_net_io.bytes_recv) * 8) / time_delta
        ul_bps = ((net_io.bytes_sent - self.last_net_io.bytes_sent) * 8) / time_delta
        
        self.last_net_io = net_io
        self.last_time = now

        current_total_gb = (net_io.bytes_sent + net_io.bytes_recv) / (1024**3)
        diff = current_total_gb - saved_data["last_psutil"] if current_total_gb >= saved_data["last_psutil"] else current_total_gb
            
        saved_data["total_used"] += diff
        saved_data["daily_usage"][today_str] += diff
        saved_data["last_psutil"] = current_total_gb
        
        used = saved_data["total_used"]
        limit = saved_data["plan_limit_gb"]
        remaining = max(0, limit - used)
        usage_pct = (used / limit) * 100 if limit > 0 else 100

        if usage_pct >= 100 and not saved_data["alerts_triggered"]["100"]:
            notify_user("Data Quota Exceeded!", "You have used 100% of your data plan.")
            saved_data["alerts_triggered"]["100"] = True
        elif usage_pct >= 90 and not saved_data["alerts_triggered"]["90"]:
            notify_user("Data Alert: 90%", "You are running out of data.")
            saved_data["alerts_triggered"]["90"] = True
        elif usage_pct >= 80 and not saved_data["alerts_triggered"]["80"]:
            notify_user("Data Alert: 80%", "You have used 80% of your data plan.")
            saved_data["alerts_triggered"]["80"] = True

        return {
            "boot_dl": f"{net_io.bytes_recv / (1024**3):.2f} GB", "boot_ul": f"{net_io.bytes_sent / (1024**3):.2f} GB",
            "used": f"{used:.2f} GB", "remaining": f"{remaining:.2f} GB", "usage_percent": usage_pct, "plan_limit": limit,
            "live_dl_raw_mbps": dl_bps / 1_000_000, "live_ul_raw_mbps": ul_bps / 1_000_000, 
            "live_dl_kbps": dl_bps / 1000, "live_ul_kbps": ul_bps / 1000,
            "outage": is_internet_down
        }

    def run_speed_test_python(self, server_id=None):
        threading.Thread(target=self._speed_test_logic, args=(server_id,), daemon=True).start()

    def _speed_test_logic(self, server_id):
        try:
            try: st = speedtest.Speedtest(secure=False)
            except: st = speedtest.Speedtest(secure=True)
            
            if window: window.evaluate_js('update_speed_status("Finding optimal server...")')
            time.sleep(0.5)
            
            if server_id and server_id != "": st.get_servers(servers=[server_id])
            st.get_best_server()
            ping_ms = st.results.ping
            server_name = st.results.server['name']
            sponsor = st.results.server['sponsor']
            full_server_name = f"{sponsor} ({server_name})"

            if window: window.evaluate_js('update_speed_status("Testing Download Bandwidth...")')
            download_speed = st.download() / 1_000_000 

            if window: window.evaluate_js('update_speed_status("Testing Upload Bandwidth...")')
            upload_speed = st.upload() / 1_000_000 
            
            global saved_data
            result_obj = {
                "date": datetime.datetime.now().strftime("%d %b %Y, %H:%M"),
                "dl": f"{download_speed:.1f}", "ul": f"{upload_speed:.1f}", "ping": f"{ping_ms:.0f}"
            }
            saved_data["speed_history"].insert(0, result_obj)
            saved_data["speed_history"] = saved_data["speed_history"][:50] 
            save_data(saved_data)

            if window: window.evaluate_js(f'update_speed_results("{download_speed:.2f}", "{upload_speed:.2f}", "{ping_ms:.0f}", "{full_server_name}")')
        except Exception as e:
            if window: window.evaluate_js('show_error_state("Connection Failed! Check internet or try another server.")')

def trigger_close_modal():
    time.sleep(0.1) 
    if window: window.evaluate_js('showCloseModal()')

def on_closing():
    threading.Thread(target=trigger_close_modal, daemon=True).start()
    return False

if __name__ == '__main__':
    threading.Thread(target=setup_tray, daemon=True).start()
    api = Api()
    html_file = resource_path('index.html') 
    window = webview.create_window('C - Dashboard', url=html_file, js_api=api, width=1150, height=880, resizable=True, background_color='#000000')
    window.events.closing += on_closing
    webview.start(debug=False)