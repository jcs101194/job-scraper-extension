const copyButton = document.getElementById("copyButton");
const statusElement = document.getElementById("status");
const previewElement = document.getElementById("preview");

function setStatus(message, kind = "")
{
    statusElement.textContent = message;
    statusElement.className = `status ${kind}`.trim();
}

function setPreview(fields)
{
    const previewFields = [
        "position",
        "company",
        "pay",
        "commute",
        "employmentType",
        "flags"
    ];

    for (const fieldName of previewFields)
    {
        document.getElementById(fieldName).textContent = fields[fieldName] || "—";
    }

    previewElement.classList.remove("hidden");
}

function isSupportedUrl(url)
{
    try
    {
        const hostname = new URL(url).hostname.toLowerCase();
        return hostname === "indeed.com"
            || hostname.endsWith(".indeed.com")
            || hostname === "ziprecruiter.com"
            || hostname.endsWith(".ziprecruiter.com");
    }
    catch
    {
        return false;
    }
}

async function getActiveTab()
{
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || typeof tab.id !== "number")
    {
        throw new Error("No active browser tab was found.");
    }

    return tab;
}

async function scrapeActiveTab(tabId)
{
    await chrome.scripting.executeScript({
        target: { tabId },
        files: ["scraper.js"]
    });

    return chrome.tabs.sendMessage(tabId, { type: "SCRAPE_JOB_ROW" });
}

copyButton.addEventListener("click", async () =>
{
    copyButton.disabled = true;
    setStatus("Reading this posting…");

    try
    {
        const tab = await getActiveTab();

        if (!isSupportedUrl(tab.url || ""))
        {
            throw new Error("Open an Indeed or ZipRecruiter job posting first.");
        }

        const response = await scrapeActiveTab(tab.id);

        if (!response || !response.ok)
        {
            throw new Error(response?.error || "Could not read this job posting.");
        }

        if (!response.fields.position && !response.fields.company)
        {
            throw new Error("This page does not appear to be an individual job posting.");
        }

        await navigator.clipboard.writeText(response.row);
        setPreview(response.fields);
        setStatus("Copied. Paste into the first empty spreadsheet row.", "success");
    }
    catch (error)
    {
        setStatus(error.message || "Could not copy the job row.", "error");
    }
    finally
    {
        copyButton.disabled = false;
    }
});
