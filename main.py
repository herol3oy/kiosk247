import os
import subprocess
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from pathlib import Path

import cloudinary
import cloudinary.uploader

from cleanup import get_js_cleanup

URLS_FILE = Path("urls.txt")
OUTPUT_DIR = Path("screenshots")

TZ_WARSAW = ZoneInfo("Europe/Warsaw")

cloudinary.config(
    cloud_name=os.environ["CLOUDINARY_CLOUD_NAME"],
    api_key=os.environ["CLOUDINARY_API_KEY"],
    api_secret=os.environ["CLOUDINARY_API_SECRET"],
    secure=True,
)
    
def load_urls():
    if not URLS_FILE.exists():
        raise FileNotFoundError(f"{URLS_FILE} not found!")

    with open(URLS_FILE) as file:
        return [line.strip() for line in file if line.strip()]

def upload_screenshot(file_path: Path, public_id: str, tags: list):
    try:
        result = cloudinary.uploader.upload(
            file_path,
            public_id=public_id,
            resource_type="image",
            overwrite=True,
            unique_filename=False,
            use_filename=False,
            tags=tags,
        )

        print(f"Uploaded: {result['secure_url']}")
        
        file_path.unlink()

    except Exception as upload_err:
        print(f"Cloudinary upload failed: {upload_err}")

def take_screenshots():
    urls = load_urls()
    now = datetime.now(TZ_WARSAW)
    timestamp = now.strftime("%Y-%m-%d_%H-%M")
    year = now.strftime("%Y")
    month = now.strftime("%m")
    
    print(f"\nScreenshot cycle {timestamp}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for url in urls:
        target_url = f"https://{url}"

        filename = f"{url}_{timestamp}.jpg"
        temp_jpg_path = OUTPUT_DIR / filename

        public_id = f"kiosk247/{url}/{year}/{month}/{timestamp}"

        tags = ["kiosk247", url, year, month, "screenshot"]

        print(f"Capturing {target_url}")

        command = [
            "shot-scraper", target_url,
            "-o", str(temp_jpg_path),
            "--wait", "2000",
            "--width", "1440",
            "--height", "1080",
            "--quality", "70",
            "--javascript", get_js_cleanup(),
        ]

        try:
            subprocess.run(
                command,
                check=True,
                timeout=60,
            )
            
            upload_screenshot(temp_jpg_path, public_id, tags)

        except Exception as capture_err:
            print(f"Screenshot failed: {capture_err}")

def wait_until_next_hour():
    now = datetime.now(TZ_WARSAW)
    
    next_run = (now + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
    
    sleep_seconds = (next_run - now).total_seconds()
    
    print(f"\nSleeping {int(sleep_seconds)}s until {next_run.strftime('%H:%M:%S')}")
    time.sleep(sleep_seconds)

def main():
    print(f"Started in {TZ_WARSAW}")
     
    while True:
        wait_until_next_hour()
        take_screenshots()

if __name__ == "__main__":
    main()