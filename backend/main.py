import os
import subprocess
import signal
import sys
import logging
import concurrent.futures
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from dotenv import load_dotenv
from supabase import create_client, Client
import cloudinary
import cloudinary.uploader

from cleanup import get_js_cleanup

load_dotenv()

URLS_FILE = Path("urls.txt")
OUTPUT_DIR = Path("screenshots")
TZ_WARSAW = ZoneInfo("Europe/Warsaw")

MAX_WORKERS = 4 

VIEWPORTS = {
    "desktop": {
        "width": "1920", 
        "height": "1080", 
        "ua": None
    },
    "mobile": {
        "width": "390", 
        "height": "844",
        "ua": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    },
}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)

logger = logging.getLogger(__name__)

supabase: Client = create_client(
    os.environ.get("SUPABASE_URL"),
    os.environ.get("SUPABASE_SECRET_KEY")
)

cloudinary.config(
    cloud_name=os.environ["CLOUDINARY_CLOUD_NAME"],
    api_key=os.environ["CLOUDINARY_API_KEY"],
    api_secret=os.environ["CLOUDINARY_API_SECRET"],
    secure=True,
)

def load_urls():
    if not URLS_FILE.exists():
        logger.warning(f"{URLS_FILE} not found!")
        return []
    with open(URLS_FILE) as file:
        return [line.strip() for line in file if line.strip()]

def store_screenshot_job(url, public_id, cloudinary_url, status, captured_at, device):
    try:
        supabase.table("screenshots").insert({
            "url": url,
            "public_id": public_id,
            "cloudinary_url": cloudinary_url,
            "job_status": status,
            "captured_at": captured_at.isoformat(),
            "device": device,
        }).execute()
    except Exception:
        logger.exception(f"DB Insert failed for {url} ({device})")

def process_single_url(url, timestamp_str, captured_at, timestamp_iso):
    target_url = f"https://{url}"

    for device_name, config in VIEWPORTS.items():
        filename = f"{url}_{device_name}_{timestamp_str}.jpg"
        file_path = OUTPUT_DIR / filename
        public_id = f"kiosk247/{url}/{device_name}/{timestamp_iso}"

        command = [
            "shot-scraper", target_url,
            "-o", str(file_path),
            "--wait", "2500",
            "--width", config["width"],
            "--height", config["height"],
            "--quality", "70",
            "--javascript", get_js_cleanup(),
        ]
        
        if config["ua"]:
            command.extend(["--user-agent", config["ua"]])

        try:
            logger.info(f"Capturing {url} [{device_name}]")
            
            subprocess.run(command, check=True, timeout=45, capture_output=True)

            logger.info(f"Uploading {url} [{device_name}]")
            res = cloudinary.uploader.upload(
                file_path, public_id=public_id, resource_type="image", overwrite=True
            )
            
            file_path.unlink(missing_ok=True)
            
            store_screenshot_job(url, public_id, res["secure_url"], "ok", captured_at, device_name)

        except subprocess.CalledProcessError as e:
            logger.error(f"Shot-scraper error for {url} [{device_name}]")
            store_screenshot_job(url, public_id, None, "failed", captured_at, device_name)
        except Exception as e:
            logger.error(f"General error for {url} [{device_name}]: {e}")
            store_screenshot_job(url, public_id, None, "failed", captured_at, device_name)

def take_screenshots():
    logger.info("Starting Batch Screenshot Job")
    
    urls = load_urls()
    now = datetime.now(TZ_WARSAW)
    timestamp_str = now.strftime("%Y-%m-%d_%H-%M")
    captured_at = now.astimezone(timezone.utc)
    timestamp_iso = captured_at.strftime("%Y-%m-%dT%H-%M-%SZ")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = [
            executor.submit(process_single_url, url, timestamp_str, captured_at, timestamp_iso)
            for url in urls
        ]
        concurrent.futures.wait(futures)

    logger.info("Batch Job Finished")

def start_scheduler():
    scheduler = BackgroundScheduler(timezone=TZ_WARSAW)
    scheduler.add_job(take_screenshots, CronTrigger(minute=0), id="hourly_screenshots", replace_existing=True)
    scheduler.start()
    return scheduler

def shutdown(scheduler):
    scheduler.shutdown(wait=False)
    sys.exit(0)

def main():
    logger.info(f"App started. Timezone: {TZ_WARSAW}")
    scheduler = start_scheduler()
    signal.signal(signal.SIGINT, lambda *_: shutdown(scheduler))
    signal.signal(signal.SIGTERM, lambda *_: shutdown(scheduler))
    signal.pause()

if __name__ == "__main__":
    main()