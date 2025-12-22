import os
import subprocess
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from pathlib import Path
import signal
import sys
import logging

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

VIEWPORTS = {
    "desktop": {"width": "1440", "height": "1080"},
    "mobile": {"width": "390", "height": "844"},
}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)

logger = logging.getLogger(__name__)

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SECRET_KEY")
supabase: Client = create_client(url, key)

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


def store_screenshot_job(
    url: str,
    public_id: str,
    cloudinary_url: str | None,
    status: str,
    captured_at: datetime,
    device: str,
):
    try:
        supabase.table("screenshots").insert(
            {
                "url": url,
                "public_id": public_id,
                "cloudinary_url": cloudinary_url,
                "job_status": status,
                "captured_at": captured_at.isoformat(),
                "device": device,
            }
        ).execute()
        logger.info("Stored %s job in Supabase for %s", device, url)
    except Exception:
        logger.exception("Supabase insert failed for %s (%s)", url, device)


def upload_screenshot(file_path: Path, public_id: str):
    try:
        result = cloudinary.uploader.upload(
            file_path,
            public_id=public_id,
            resource_type="image",
            overwrite=True,
            unique_filename=False,
            use_filename=False,
        )

        secure_url = result["secure_url"]
        logger.info("Uploaded %s", secure_url)
        file_path.unlink(missing_ok=True)
        return {"secure_url": secure_url}

    except Exception:
        logger.exception("Cloudinary upload failed")
        return None


def take_screenshots():
    logger.info("Starting screenshot job")

    urls = load_urls()
    now = datetime.now(TZ_WARSAW)
    
    timestamp_str = now.strftime("%Y-%m-%d_%H-%M")
    captured_at = now.astimezone(timezone.utc)
    timestamp_iso = captured_at.strftime("%Y-%m-%dT%H-%M-%SZ")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for url in urls:
        target_url = f"https://{url}"

        for device_name, dims in VIEWPORTS.items():
            
            filename = f"{url}_{device_name}_{timestamp_str}.jpg"
            temp_jpg_path = OUTPUT_DIR / filename
            
            public_id = f"kiosk247/{url}/{device_name}/{timestamp_iso}"

            logger.info("Capturing %s [%s]", target_url, device_name)

            command = [
                "shot-scraper",
                target_url,
                "-o",
                str(temp_jpg_path),
                "--wait", "2000",
                "--width", dims["width"],
                "--height", dims["height"],
                "--quality", "75",
                "--javascript", get_js_cleanup(),
            ]
            
            if device_name == "mobile":
                command.extend(["--user-agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"])

            try:
                subprocess.run(command, check=True, timeout=60)
                upload_result = upload_screenshot(temp_jpg_path, public_id)

                if upload_result:
                    store_screenshot_job(
                        url,
                        public_id,
                        upload_result["secure_url"],
                        "ok",
                        captured_at,
                        device_name,
                    )
                else:
                    store_screenshot_job(
                        url, public_id, None, "failed", captured_at, device_name
                    )

            except Exception:
                logger.error("Screenshot failed for %s [%s]", target_url, device_name, exc_info=True)
                store_screenshot_job(
                    url, public_id, None, "failed", captured_at, device_name
                )

    logger.info("Screenshot job finished")


def start_scheduler():
    scheduler = BackgroundScheduler(timezone=TZ_WARSAW)

    scheduler.add_job(
        take_screenshots,
        CronTrigger(minute=0),
        id="hourly_screenshots",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=300,
    )

    scheduler.start()
    logger.info("Scheduler started (hourly screenshots)")

    return scheduler


def shutdown(scheduler):
    logger.info("Shutting down scheduler...")
    scheduler.shutdown(wait=False)
    sys.exit(0)


def main():
    logger.info("App started in timezone %s", TZ_WARSAW)

    scheduler = start_scheduler()

    signal.signal(signal.SIGINT, lambda *_: shutdown(scheduler))
    signal.signal(signal.SIGTERM, lambda *_: shutdown(scheduler))

    signal.pause()

if __name__ == "__main__":
    main()