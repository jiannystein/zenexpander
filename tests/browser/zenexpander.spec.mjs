import { expect, test } from "@playwright/test";

async function createWorkspace(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create local config" }).click();
  await expect(page.getByRole("navigation", { name: "ZenExpander sections" })).toBeVisible();
  await page.getByRole("button", { name: /Setup/ }).click();
  await expect(page.getByText("Widget bridge ready")).toBeVisible();
  const bookmarklet = page.locator(".bookmarklet-button");
  await expect(bookmarklet).toHaveAttribute("href", /^javascript:/);
  return bookmarklet.getAttribute("href");
}

async function activateBookmarklet(page, href) {
  await page.evaluate((bookmarkletHref) => {
    const link = document.createElement("a");
    link.id = "activate-zenexpander";
    link.href = bookmarkletHref;
    link.textContent = "Activate ZenExpander";
    document.body.append(link);
  }, href);
  await page.locator("#activate-zenexpander").click();
  await expect(page.locator("#zenexpander-runtime")).toBeAttached();
  await expect(page.getByText(/private expansions ready/)).toBeVisible();
}

async function openFixture(page) {
  await page.goto("/tests/fixtures/multitab-lab.html");
  await expect(page.getByRole("heading", { name: "Multi-tab acceptance lab" })).toBeVisible();
}

test("configurator stays polished and undoable across required widths", async ({ page }) => {
  await createWorkspace(page);
  await expect(page).toHaveTitle("ZenExpander v0.2.0 · Private text expansion");
  await expect(page.getByRole("heading", { name: "Add ZenExpander to your bookmarks bar." })).toBeVisible();
  await expect(page.locator(".brand-version")).toHaveText("v0.2.0");
  await expect(page.locator(".bookmarklet-button")).toContainText("ZenExpander v0.2.0");
  await expect(page.getByText("Optional: use related tabs")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the related-tab test" })).toHaveAttribute("href", "./multitab-lab.html");

  for (const width of [320, 375, 414, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: width < 600 ? 812 : 900 });
    const layout = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      visibleSteps: [...document.querySelectorAll(".primary-nav button")].filter((button) => {
        const rect = button.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }).length,
    }));
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
    expect(layout.visibleSteps).toBe(3);
  }

  await page.getByRole("button", { name: /Expansions/ }).click();
  const headingShortcut = page.locator(".editor-heading-shortcut");
  await expect(headingShortcut).toBeVisible();
  expect(await headingShortcut.evaluate((node) => getComputedStyle(node).color))
    .not.toBe(await page.locator(".editor-pane h1").evaluate((node) => getComputedStyle(node).color));
  const tabs = page.getByRole("tab");
  const originalCount = await tabs.count();
  await page.getByRole("button", { name: /^Delete / }).first().click();
  await expect(page.getByText(/^Deleted ;/)).toBeVisible();
  await expect(tabs).toHaveCount(originalCount - 1);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(tabs).toHaveCount(originalCount);
});

test("inline consent arms same-origin children lazily, cascades, reloads, and disarms", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const configurator = await context.newPage();
  const href = await createWorkspace(configurator);
  const source = await context.newPage();
  await openFixture(source);
  await activateBookmarklet(source, href);

  await source.getByRole("button", { name: "Use in new tabs" }).click();
  await expect(source.getByRole("heading", { name: "Use ZenExpander in new tabs on this site?" })).toBeVisible();
  await expect(source.getByText("http://127.0.0.1:4321", { exact: true })).toBeVisible();
  await source.getByRole("button", { name: "Use on new tabs" }).click();
  await expect(source.getByText("New tabs on · 127.0.0.1:4321")).toBeVisible();

  const childPromise = context.waitForEvent("page");
  await source.getByRole("button", { name: "Open same-origin ticket" }).click();
  const child = await childPromise;
  await child.waitForLoadState("domcontentloaded");
  await expect(child.locator("#zenexpander-runtime")).toBeAttached();
  expect(await child.locator("#zenexpander-runtime").evaluate((host) => host.shadowRoot.querySelector(".panel").hidden)).toBe(true);
  await child.getByRole("textbox", { name: "Unsaved ticket note" }).fill(";hello");
  await expect(child.getByRole("option", { name: /;hello/ })).toBeVisible();
  await child.keyboard.press("Escape");
  await child.getByRole("button", { name: "Open ZenExpander" }).click();
  await expect(child.getByText(/private expansions ready/)).toBeVisible();
  await expect(child.getByText("New tabs on · 127.0.0.1:4321")).toBeVisible();

  const childEditor = child.getByRole("textbox", { name: "Unsaved ticket note" });
  await childEditor.fill(";options");
  await child.getByRole("option", { name: /;options/ }).click();
  const confirmChoice = child.getByRole("button", { name: /Confirm and paste/ });
  await expect(confirmChoice).toBeVisible();
  await confirmChoice.click();
  await expect(confirmChoice).toBeHidden();
  await expect(childEditor).toContainText(/Hey, we have Beef/);
  await childEditor.fill(";");
  await expect(child.getByRole("option", { name: /;hello/ })).toBeVisible();
  await expect(child.getByRole("option", { name: /;options/ })).toBeVisible();

  await child.getByRole("button", { name: "Minimize" }).click();
  const grandchildPromise = context.waitForEvent("page");
  await child.getByRole("button", { name: "Open same-origin ticket" }).click();
  const grandchild = await grandchildPromise;
  await grandchild.waitForLoadState("domcontentloaded");
  await expect(grandchild.locator("#zenexpander-runtime")).toBeAttached();

  await child.reload();
  await expect(child.locator("#zenexpander-runtime")).toBeAttached();
  expect(await source.evaluate(() => window.__sendCount)).toBe(0);
  expect(await child.evaluate(() => window.__sendCount)).toBe(0);

  await source.getByRole("button", { name: "Stop for new tabs" }).click();
  await expect(source.getByText("Ready · New tabs off")).toBeVisible();
  await expect(child.locator("#zenexpander-runtime")).toBeAttached();

  const unarmedPromise = context.waitForEvent("page");
  await source.getByRole("button", { name: "Open same-origin ticket" }).click();
  const unarmed = await unarmedPromise;
  await unarmed.waitForLoadState("domcontentloaded");
  await expect(unarmed.locator("#zenexpander-runtime")).toHaveCount(0);
  await context.close();
});

test("unsupported window boundaries remain untouched and session state starts off", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const configurator = await context.newPage();
  const href = await createWorkspace(configurator);
  const source = await context.newPage();
  await openFixture(source);
  await activateBookmarklet(source, href);

  const panelBounds = await source.locator("#zenexpander-runtime").evaluate((host) => {
    const rect = host.shadowRoot.querySelector(".panel").getBoundingClientRect();
    return { left: rect.left, right: rect.right, width: innerWidth };
  });
  expect(panelBounds.left).toBeGreaterThanOrEqual(0);
  expect(panelBounds.right).toBeLessThanOrEqual(panelBounds.width);

  await source.getByRole("button", { name: "Use in new tabs" }).click();
  await source.keyboard.press("Escape");
  await expect(source.getByRole("heading", { name: "Use ZenExpander in new tabs on this site?" })).toHaveCount(0);
  expect(await source.locator("#zenexpander-runtime").evaluate((host) => host.shadowRoot.activeElement?.dataset.role)).toBe("origin-toggle");

  await source.getByRole("button", { name: "Use in new tabs" }).click();
  await source.getByRole("button", { name: "Use on new tabs" }).click();
  await expect(source.getByText("New tabs on · 127.0.0.1:4321")).toBeVisible();
  await source.getByRole("button", { name: "Minimize" }).click();

  for (const buttonName of ["Open cross-origin ticket", "Open isolated ticket", "Open browser-managed ticket"]) {
    const popupPromise = context.waitForEvent("page");
    await source.getByRole(buttonName === "Open browser-managed ticket" ? "link" : "button", { name: buttonName }).click();
    const popup = await popupPromise;
    await popup.waitForLoadState("domcontentloaded");
    await expect(popup.locator("#zenexpander-runtime")).toHaveCount(0);
    await popup.close();
  }

  expect(await source.evaluate(() => window.__sendCount)).toBe(0);
  await context.close();
});
