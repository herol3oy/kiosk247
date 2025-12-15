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

def load_urls():
    if not URLS_FILE.exists():
        raise FileNotFoundError(f"{URLS_FILE} not found")

    with open(URLS_FILE) as file:
        return [line.strip() for line in file if line.strip()]

def take_screenshots():
    urls = load_urls()
    
    timestamp = datetime.now(TZ_WARSAW).strftime("%Y-%m-%d_%H-%M")
    print(f"\nScreenshot cycle {timestamp}")
        
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    for url in urls:
        filename_base = f"{url}_{timestamp}"
        temp_png_path = OUTPUT_DIR / f"{filename_base}.png"
        final_webp_path = OUTPUT_DIR / f"{filename_base}.webp"    
            
        target_url = url if url.startswith("http") else f"https://{url}"

        print(f" > Capturing {target_url} -> {final_webp_path.name}")

        command = [
            "shot-scraper", target_url, 
            "-o", str(temp_png_path),
            "--wait", "2000",
            "--width", "1440",
            "--height", "1080"
        ]
        
        command.extend(["--javascript", get_js_cleanup()])
    
        try:
            subprocess.run(command, check=True)
            
            try:
                with Image.open(temp_png_path) as img:
                    img.save(final_webp_path, "WEBP", quality=60, optimize=True)
                
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
    
    print(f"\nSleeping {int(sleep_seconds)}s until {next_run.strftime('%H:%M:%S')}")
    time.sleep(sleep_seconds)

def main():
    print(f"Service started in {TZ_WARSAW}")
    
    while True:
        wait_until_next_hour()
        take_screenshots()

if __name__ == "__main__":
    main()