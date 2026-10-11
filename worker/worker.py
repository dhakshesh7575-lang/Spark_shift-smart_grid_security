#!/usr/bin/env python3
import os
import sys
import time
import logging
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.common.exceptions import WebDriverException, TimeoutException, NoSuchElementException
except Exception as e:
    print(f"Missing dependencies: {e}", file=sys.stderr)
    sys.exit(1)

load_dotenv()

Path("logs").mkdir(exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s: %(message)s',
    handlers=[
        logging.FileHandler('logs/whatsapp-worker.log', encoding='utf-8'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger('worker')

BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_PROFILE = BASE_DIR / ".whatsapp_profile"
PROFILE_DIR = Path(os.getenv("WHATSAPP_PROFILE_DIR", str(DEFAULT_PROFILE))).resolve()
TEST_MODE = os.getenv("WHATSAPP_WORKER_TEST_MODE", "true").lower() != "false"
TEST_MODE_GLOBAL = os.getenv("WHATSAPP_TEST_MODE", "true").lower() != "false"
def find_chrome():
    candidates = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    ]
    for c in candidates:
        if Path(c).exists():
            return c
    return None

def launch_driver():
    chrome_path = find_chrome()
    if not chrome_path:
        raise RuntimeError("Chrome/Edge not found")
    PROFILE_DIR.mkdir(exist_ok=True)
    logger.info(f"[launch] profile_dir={PROFILE_DIR}")
    logger.info(f"[launch] browser={chrome_path}")
    options = Options()
    options.add_argument(f"--user-data-dir={PROFILE_DIR}")
    options.add_argument("--no-first-run")
    options.add_argument("--no-default-browser-check")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)
    options.add_argument("--start-maximized")
    driver = webdriver.Chrome(options=options)
    driver.get("about:blank")
    logger.info("[launch] driver_started OK")
    return driver

def check_session(driver):
    try:
        driver.get("https://web.whatsapp.com")
        WebDriverWait(driver, 60).until(
            lambda d: d.find_elements(By.CSS_SELECTOR, "div[aria-label='Chat list']") or 
                      d.find_elements(By.CSS_SELECTOR, "canvas[aria-label*='Scan'], canvas")
        )
        if driver.find_elements(By.CSS_SELECTOR, "div[aria-label='Chat list']"):
            logger.info("[session] state=authenticated")
            return "authenticated"
        if driver.find_elements(By.CSS_SELECTOR, "canvas"):
            logger.info("[session] state=qr_required")
            return "qr_required"
    except Exception as e:
        logger.error(f"[session] error={e}")
        return "disconnected"
    return "disconnected"
if __name__ == '__main__':
    mode = TEST_MODE or TEST_MODE_GLOBAL
    if mode:
        logger.info("WORKER IN TEST MODE - no real browser, no real message")
        logger.info("MOCK SEND MODE ACTIVE")
        try:
            while True:
                time.sleep(10)
        except KeyboardInterrupt:
            pass
    else:
        try:
            driver = launch_driver()
            state = check_session(driver)
            logger.info(f"[session] final={state}")
            try:
                while True:
                    time.sleep(30)
            except KeyboardInterrupt:
                pass
        except Exception as e:
            logger.error(f"[error] {e}")
            sys.exit(1)
