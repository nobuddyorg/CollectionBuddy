from playwright.sync_api import sync_playwright, Page, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    # 1. Navigate to the application's home page.
    page.goto("http://localhost:3000")

    # 2. Type "berlin" into the place input field.
    place_input = page.get_by_placeholder("Ort (optional)")
    place_input.type("berlin")

    # 3. Wait for the autocomplete results to appear.
    expect(page.get_by_text("Berlin, Germany")).to_be_visible()

    # 4. Take a screenshot of the page.
    page.screenshot(path="jules-scratch/verification/verification.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
