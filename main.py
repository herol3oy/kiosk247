import subprocess
import time
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo
from cleanup import get_js_cleanup
from PIL import Image

URLS_FILE = Path("urls.txt")
OUTPUT_DIR = Path("screenshots")

TZ_WARSAW = ZoneInfo("Europe/Warsaw")

SCREENSHOT_WIDTH = 1440
SCREENSHOT_HEIGHT = 1080

WAIT_MS = 2000
SUBPROCESS_TIMEOUT = 60

WEBP_QUALITY = 60
WEBP_OPTIMIZE = True
WEBP_FORMAT = "WEBP"

TIMESTAMP_FORMAT = "%Y-%m-%d_%H-%M"
TIME_FORMAT = '%H:%M:%S'
    
def load_urls():
    if not URLS_FILE.exists():
        raise FileNotFoundError(f"{URLS_FILE} not found!")

    with open(URLS_FILE) as file:
        return [line.strip() for line in file if line.strip()]

def take_screenshots():
    urls = load_urls()
    
    timestamp = datetime.now(TZ_WARSAW).strftime(TIMESTAMP_FORMAT)
    print(f"\nScreenshot cycle {timestamp}")
        
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    for url in urls:
        target_url = f"https://{url}"

        filename_base = f"{url}_{timestamp}"
        temp_png_path = OUTPUT_DIR / f"{filename_base}.png"
        final_webp_path = OUTPUT_DIR / f"{filename_base}.webp"    
            
        print(f" > Capturing {target_url} -> {final_webp_path.name}")

        command = [
            "shot-scraper", target_url,
            "-o", str(temp_png_path),
            "--wait", str(WAIT_MS),
            "--width", str(SCREENSHOT_WIDTH),
            "--height", str(SCREENSHOT_HEIGHT),
            "--javascript", get_js_cleanup(),
        ]
        
        try:
            subprocess.run(
                command,
                check=True,
                timeout=SUBPROCESS_TIMEOUT,
            )
            
            try:
                with Image.open(temp_png_path) as img:
                    img.save(
                        final_webp_path,
                        WEBP_FORMAT,
                        quality=WEBP_QUALITY,
                        optimize=WEBP_OPTIMIZE,
                    )
                
                temp_png_path.unlink()
                print(f"Saved WebP")
                
            except Exception as img_err:
                print(f"Conversion failed: {img_err}")
            
        except Exception as e:
            print(f"Error capturing {url}: {e}")

def wait_until_next_hour():
    now = datetime.now(TZ_WARSAW)
    
    next_run = (now + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
    
    sleep_seconds = (next_run - now).total_seconds()
    
    print(f"\nSleeping {int(sleep_seconds)}s until {next_run.strftime(TIME_FORMAT)}")
    time.sleep(sleep_seconds)

def main():
    print(f"Started in {TZ_WARSAW}")
    
    while True:
        take_screenshots()
        wait_until_next_hour()

if __name__ == "__main__":
    main()