(() =>
{
    if (globalThis.__jobRowCopierInstalled)
    {
        return;
    }

    globalThis.__jobRowCopierInstalled = true;

    const MAX_DESCRIPTION_LENGTH = 45000;
    const COLUMN_ORDER = [
        "position",
        "company",
        "sector",
        "industry",
        "requirements",
        "pay",
        "commute",
        "employmentType",
        "applicationSubmissionDate",
        "applicationCount",
        "responseSentiment",
        "pocName",
        "pocNumber",
        "status",
        "flags",
        "link",
        "comments"
    ];

    function collapseWhitespace(value)
    {
        return String(value || "")
            .replace(/\u00a0/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function htmlToText(value)
    {
        if (!value)
        {
            return "";
        }

        const element = document.createElement("div");
        element.innerHTML = String(value);
        return collapseWhitespace(element.textContent || element.innerText || "");
    }

    function safeCell(value, maxLength = undefined)
    {
        const text = collapseWhitespace(value)
            .replace(/\t/g, " ")
            .replace(/\r?\n/g, " ");

        if (maxLength && text.length > maxLength)
        {
            return `${text.slice(0, maxLength - 13)}... [truncated]`;
        }

        return text;
    }

    function safeMultilineCell(value, maxLength = undefined)
    {
        const text = String(value || "")
            .replace(/\u00a0/g, " ")
            .replace(/\t/g, " ")
            .replace(/[ \f\v]+/g, " ")
            .replace(/ *\r?\n */g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim();

        if (maxLength && text.length > maxLength)
        {
            return `${text.slice(0, maxLength - 15).trim()}\n... [truncated]`;
        }

        return text;
    }

    function tsvCell(value, { multiline = false } = {})
    {
        const text = multiline ? safeMultilineCell(value) : safeCell(value);

        if (text.includes("\t") || text.includes("\n") || text.includes('"'))
        {
            return `"${text.replace(/"/g, '""')}"`;
        }

        return text;
    }

    function textFromNode(node)
    {
        return safeCell(node?.textContent || "");
    }

    function firstText(selectors, root = document)
    {
        for (const selector of selectors)
        {
            const text = textFromNode(root.querySelector(selector));

            if (text)
            {
                return text;
            }
        }

        return "";
    }

    function firstNode(selectors, root = document)
    {
        for (const selector of selectors)
        {
            const node = root.querySelector(selector);

            if (node)
            {
                return node;
            }
        }

        return null;
    }

    function allText(selector, root = document)
    {
        return [...root.querySelectorAll(selector)]
            .map(textFromNode)
            .filter(Boolean);
    }

    function isJobPosting(value)
    {
        const type = value?.["@type"];
        return type === "JobPosting"
            || (Array.isArray(type) && type.includes("JobPosting"));
    }

    function findJobPosting(value)
    {
        if (!value)
        {
            return null;
        }

        if (Array.isArray(value))
        {
            for (const child of value)
            {
                const match = findJobPosting(child);

                if (match)
                {
                    return match;
                }
            }

            return null;
        }

        if (typeof value === "object")
        {
            if (isJobPosting(value))
            {
                return value;
            }

            if (value["@graph"])
            {
                return findJobPosting(value["@graph"]);
            }
        }

        return null;
    }

    function readStructuredPosting()
    {
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');

        for (const script of scripts)
        {
            try
            {
                const posting = findJobPosting(JSON.parse(script.textContent || ""));

                if (posting)
                {
                    return posting;
                }
            }
            catch
            {
                // Invalid third-party JSON-LD should not stop page fallback extraction.
            }
        }

        return {};
    }

    function organizationName(posting)
    {
        if (typeof posting.hiringOrganization === "string")
        {
            return posting.hiringOrganization;
        }

        return posting.hiringOrganization?.name || "";
    }

    function formatAddress(address)
    {
        if (!address)
        {
            return "";
        }

        if (typeof address === "string")
        {
            return safeCell(address);
        }

        return [
            address.addressLocality,
            address.addressRegion,
            address.postalCode
        ].filter(Boolean).map(safeCell).join(", ");
    }

    function structuredLocation(posting)
    {
        const locations = Array.isArray(posting.jobLocation)
            ? posting.jobLocation
            : posting.jobLocation
                ? [posting.jobLocation]
                : [];

        const formatted = locations
            .map((location) => formatAddress(location.address || location))
            .filter(Boolean)
            .join(" / ");

        if (posting.jobLocationType === "TELECOMMUTE")
        {
            return formatted ? `Remote (${formatted})` : "Remote";
        }

        return formatted;
    }

    function currencySymbol(currency)
    {
        const symbols = { USD: "$", CAD: "CA$", GBP: "\u00a3", EUR: "\u20ac" };
        return symbols[currency] || (currency ? `${currency} ` : "");
    }

    function formatSalary(posting)
    {
        const salary = posting.baseSalary || posting.estimatedSalary;

        if (!salary)
        {
            return "";
        }

        if (typeof salary === "string" || typeof salary === "number")
        {
            return safeCell(salary);
        }

        const value = salary.value || salary;
        const currency = salary.currency || value.currency || "";
        const symbol = currencySymbol(currency);
        const unit = safeCell(value.unitText || salary.unitText || "")
            .toLowerCase()
            .replace("_", " ");
        const min = value.minValue;
        const max = value.maxValue;
        const exact = value.value;

        let amount = "";
        if (min !== undefined && max !== undefined)
        {
            amount = `${symbol}${min} - ${symbol}${max}`;
        }
        else if (exact !== undefined)
        {
            amount = `${symbol}${exact}`;
        }
        else if (min !== undefined)
        {
            amount = `From ${symbol}${min}`;
        }
        else if (max !== undefined)
        {
            amount = `Up to ${symbol}${max}`;
        }

        return safeCell(unit && amount ? `${amount} / ${unit}` : amount);
    }

    function normalizeEmploymentType(value)
    {
        const types = Array.isArray(value) ? value : value ? [value] : [];
        return types.map((type) =>
            String(type)
                .replaceAll("_", " ")
                .toLowerCase()
                .replace(/\b\w/g, (letter) => letter.toUpperCase())
        ).join(", ");
    }

    function detectFlags(title, location, description)
    {
        const searchable = `${title} ${location} ${description.slice(0, 1200)}`;
        const flags = [];

        if (/\bremote\b/i.test(searchable))
        {
            flags.push("Remote");
        }
        if (/\bhybrid\b/i.test(searchable))
        {
            flags.push("Hybrid");
        }
        if (/\bon[- ]?site\b|\bin[- ]person\b/i.test(searchable))
        {
            flags.push("On-site");
        }

        return [...new Set(flags)].join(", ");
    }

    function formatToday()
    {
        const today = new Date();
        const month = String(today.getMonth() + 1).padStart(2, "0");
        const day = String(today.getDate()).padStart(2, "0");
        return `${month}/${day}/${today.getFullYear()}`;
    }

    function normalizeCommute(value, flags = "")
    {
        const text = `${value} ${flags}`.toLowerCase();

        if (/\bcontract\b/.test(text))
        {
            return "Contract";
        }
        if (/\bhybrid\b/.test(text))
        {
            return "Hybrid";
        }
        if (/\bremote\b|\bwork from home\b|\bwfh\b/.test(text))
        {
            return "Remote";
        }
        if (/\bon[- ]?site\b|\bin[- ]person\b/.test(text))
        {
            return "In Person";
        }

        return value ? "In Person" : "";
    }

    function normalizeSheetEmploymentType(value)
    {
        const text = safeCell(value).toLowerCase();

        if (/\bcontract\b/.test(text))
        {
            return "Contract";
        }
        if (/\btemporary\b|\btemp\b/.test(text))
        {
            return "Temporary";
        }
        if (/\bpart[- ]?time\b/.test(text))
        {
            return "Part-time";
        }
        if (/\bfull[- ]?time\b/.test(text))
        {
            return "Full-time";
        }

        return "";
    }

    function findMatches(text, terms)
    {
        return terms.filter(({ label, pattern }) => pattern.test(text)).map(({ label }) => label);
    }

    function uniqueValues(values)
    {
        return [...new Set(values.filter(Boolean))];
    }

    function formatRequirements(description)
    {
        const text = safeCell(description);
        const years = text.match(/\b\d+\+?\s*(?:years?|yrs?)\b/i)?.[0] || "";
        const languages = uniqueValues(findMatches(text, [
            { label: "C#", pattern: /\bC#\b/i },
            { label: "C++", pattern: /\bC\+\+\b/i },
            { label: "JavaScript", pattern: /\bJavaScript\b/i },
            { label: "TypeScript", pattern: /\bTypeScript\b/i },
            { label: "Python", pattern: /\bPython\b/i },
            { label: "Java", pattern: /\bJava\b/i },
            { label: "SQL", pattern: /\bSQL\b/i },
            { label: "HTML/CSS", pattern: /\bHTML\b|\bCSS\b/i },
            { label: "PHP", pattern: /\bPHP\b/i },
            { label: "Ruby", pattern: /\bRuby\b/i },
            { label: "Go", pattern: /\bGolang\b|\bGo\b/i },
            { label: "Swift", pattern: /\bSwift\b/i },
            { label: "Kotlin", pattern: /\bKotlin\b/i }
        ]));
        const technologies = uniqueValues(findMatches(text, [
            { label: "Angular", pattern: /\bAngular\b/i },
            { label: "React", pattern: /\bReact\b/i },
            { label: "Vue", pattern: /\bVue\b/i },
            { label: "Node.js", pattern: /\bNode(?:\.js)?\b/i },
            { label: "ASP.NET Core", pattern: /\bASP\.NET Core\b/i },
            { label: ".NET Core", pattern: /\b\.NET Core\b/i },
            { label: ".NET", pattern: /\b\.NET\b/i },
            { label: "PostgreSQL", pattern: /\bPostgreSQL\b/i },
            { label: "MySQL", pattern: /\bMySQL\b/i },
            { label: "SQL Server", pattern: /\bSQL Server\b/i },
            { label: "MongoDB", pattern: /\bMongoDB\b/i },
            { label: "AWS", pattern: /\bAWS\b|\bAmazon Web Services\b/i },
            { label: "Azure", pattern: /\bAzure\b/i },
            { label: "GCP", pattern: /\bGCP\b|\bGoogle Cloud\b/i },
            { label: "Docker", pattern: /\bDocker\b/i },
            { label: "Kubernetes", pattern: /\bKubernetes\b|\bK8s\b/i },
            { label: "REST APIs", pattern: /\bREST\b|\bAPIs?\b/i },
            { label: "GraphQL", pattern: /\bGraphQL\b/i }
        ]));
        const otherSkills = uniqueValues(findMatches(text, [
            { label: "Git", pattern: /\bGit\b|\bGitHub\b|\bGitLab\b/i },
            { label: "CI/CD", pattern: /\bCI\/CD\b|\bcontinuous integration\b|\bcontinuous deployment\b/i },
            { label: "Scrum", pattern: /\bScrum\b/i },
            { label: "Agile", pattern: /\bAgile\b/i },
            { label: "OOP", pattern: /\bOOP\b|\bobject-oriented\b/i },
            { label: "design patterns", pattern: /\bdesign patterns?\b/i },
            { label: "debugging", pattern: /\bdebugging\b/i },
            { label: "mentoring", pattern: /\bmentor(?:ing)?\b/i },
            { label: "communication", pattern: /\bcommunication\b/i },
            { label: "data structures", pattern: /\bdata structures?\b/i },
            { label: "algorithms", pattern: /\balgorithms?\b/i }
        ]));
        const education = text.match(/\b(?:Bachelor'?s|BS|BA|B\.S\.|B\.A\.)[^.]{0,80}/i)?.[0] || "";
        const bullets = [];

        if (years || languages.length)
        {
            bullets.push(`-${[years, languages.join(", ")].filter(Boolean).join(" ")}`);
        }

        if (technologies.length)
        {
            bullets.push(`-${technologies.join(", ")}`);
        }

        if (otherSkills.length)
        {
            bullets.push(`-${otherSkills.join(", ")}`);
        }

        if (education)
        {
            bullets.push(`-${safeCell(education)}`);
        }

        if (!bullets.length)
        {
            bullets.push("-Experience matching the posted role requirements");
            bullets.push("-Relevant tools, platforms, and domain technologies");
        }

        while (bullets.length < 2)
        {
            bullets.push("-Additional qualifications listed in the job description");
        }

        return bullets.slice(0, 4).join("\n");
    }

    function canonicalUrl()
    {
        const link = document.querySelector("link[rel='canonical']")?.href;
        return link || window.location.href;
    }

    function hostname()
    {
        return window.location.hostname.toLowerCase();
    }

    function stripIndeedJobPostSuffix(value)
    {
        return safeCell(value).replace(/\s+-\s+job post$/i, "").trim();
    }

    function splitIndeedSalaryAndJobType(value)
    {
        const parts = safeCell(value)
            .split(/\s+-\s+/)
            .map(safeCell)
            .filter(Boolean);

        return {
            pay: parts.find((part) => /[$]|\b(?:hour|year|month|week|salary|pay)\b/i.test(part)) || "",
            employmentType: parts.find((part) => /\b(?:full|part|contract|temporary|internship|per diem)\b/i.test(part)) || ""
        };
    }

    function findSalaryInVisibleText(root = document)
    {
        const likelySalaryText = firstText([
            "#salaryInfoAndJobType",
            "[data-testid='jobsearch-JobInfoHeader-salary']",
            "[data-testid='salaryInfoAndJobType']",
            "[aria-label='Pay']",
            "[class*='salary']",
            "[class*='Salary']"
        ], root);

        if (likelySalaryText && /[$\u00a3\u20ac]|\b(?:USD|GBP|EUR|hour|year|salary|pay)\b/i.test(likelySalaryText))
        {
            return likelySalaryText;
        }

        const headerText = firstText([
            "[data-testid='jobsearch-JobInfoHeader-title']",
            ".jobsearch-JobInfoHeader-container",
            "[data-testid='right-pane']",
            "main"
        ], root).slice(0, 1500);

        const match = headerText.match(
            /(?:from\s+|up to\s+)?[$\u00a3\u20ac]\s?\d[\d,.]*(?:\s*-\s*[$\u00a3\u20ac]?\s?\d[\d,.]*)?(?:\s*(?:an?|per|\/)\s*(?:hour|hr|year|yr|month|week))?/i
        );

        return match ? safeCell(match[0]) : "";
    }

    function labeledValue(label, root = document)
    {
        const headings = [...root.querySelectorAll("h2, h3, dt, strong, b")];
        const heading = headings.find((node) => safeCell(node.textContent).toLowerCase() === label.toLowerCase());

        if (!heading)
        {
            return "";
        }

        let container = heading.parentElement;

        while (container && container !== root)
        {
            const candidates = [...container.querySelectorAll("p, dd, li, span, a")]
                .map(textFromNode)
                .filter((text) => text && text.toLowerCase() !== label.toLowerCase());

            if (candidates.length)
            {
                return candidates[0];
            }

            container = container.parentElement;
        }

        return "";
    }

    function visibleDetailValues(root = document)
    {
        return [...root.querySelectorAll("p")]
            .map(textFromNode)
            .filter((text) =>
                text
                && !/^1-click apply$/i.test(text)
                && !/^report$/i.test(text)
                && !/^posted \d+/i.test(text)
            );
    }

    function scrapeIndeed(posting)
    {
        const salaryAndType = splitIndeedSalaryAndJobType(firstText(["#salaryInfoAndJobType"]));
        const description = safeCell(
            htmlToText(posting.description) || firstText([
                "#jobDescriptionText",
                "[data-testid='jobDescriptionText']",
                ".jobsearch-jobDescriptionText",
                ".jobsearch-JobComponent-description"
            ]),
            MAX_DESCRIPTION_LENGTH
        );
        const title = stripIndeedJobPostSuffix(posting.title || firstText([
            "[data-testid='jobsearch-JobInfoHeader-title']",
            "h1.jobsearch-JobInfoHeader-title",
            "h2.jobsearch-JobInfoHeader-title",
            "#job-full-details h1",
            "#job-full-details h2"
        ]));
        const location = safeCell(structuredLocation(posting) || firstText([
            "[data-testid='inlineHeader-companyLocation']",
            "[data-testid='job-location']"
        ]));

        return {
            source: "Indeed",
            position: title,
            company: safeCell(organizationName(posting) || firstText([
                "[data-testid='inlineHeader-companyName']",
                "[data-company-name='true']",
                ".jobsearch-InlineCompanyRating"
            ])),
            industry: safeCell(posting.industry || ""),
            requirements: description,
            pay: safeCell(formatSalary(posting) || salaryAndType.pay || findSalaryInVisibleText()),
            commute: location,
            employmentType: safeCell(
                normalizeEmploymentType(posting.employmentType)
                || salaryAndType.employmentType
                || labeledValue("Job type")
            ),
            flags: detectFlags(title, location, description),
            link: safeCell(canonicalUrl())
        };
    }

    function scrapeZipRecruiter(posting)
    {
        const pane = firstNode(["[data-testid='right-pane']", "main"]) || document;
        const details = visibleDetailValues(pane);
        const descriptionNode = firstNode([
            "[data-testid='right-pane'] h2 + div[class*='whitespace-pre-line']",
            "h2 + div[class*='whitespace-pre-line']",
            "[class*='whitespace-pre-line']"
        ], pane);
        const description = safeCell(
            htmlToText(posting.description) || textFromNode(descriptionNode),
            MAX_DESCRIPTION_LENGTH
        );
        const title = safeCell(posting.title || firstText([
            "[data-testid='right-pane'] h2",
            "h2[class*='text-header-md']",
            "h2"
        ], pane));
        const company = safeCell(organizationName(posting) || firstText([
            "[data-testid='right-pane'] a[href^='/co/']",
            "a[href^='/co/']"
        ], pane));
        const location = safeCell(structuredLocation(posting) || details.find((text) =>
            /\b(?:remote|hybrid|on-site|[A-Z]{2}\b|United States)\b/.test(text)
            && !/^\$/.test(text)
        ) || "");
        const pay = safeCell(formatSalary(posting) || details.find((text) =>
            /[$\u00a3\u20ac]\s?\d|\b(?:hour|hr|year|yr|salary|pay)\b/i.test(text)
        ) || findSalaryInVisibleText(pane));
        const employmentType = safeCell(
            normalizeEmploymentType(posting.employmentType)
            || details.find((text) => /\b(?:full-time|part-time|contract|temporary|internship|per diem)\b/i.test(text))
            || ""
        );

        return {
            source: "ZipRecruiter",
            position: title,
            company,
            industry: safeCell(posting.industry || labeledValue("Industry", pane)),
            requirements: description,
            pay,
            commute: location,
            employmentType,
            flags: detectFlags(title, location, description),
            link: safeCell(canonicalUrl())
        };
    }

    function scrapeGeneric(posting)
    {
        const description = safeCell(
            htmlToText(posting.description) || firstText([
                "#jobDescriptionText",
                "[data-testid='jobDescriptionText']",
                "[data-testid='job-description']",
                "[class*='job_description']",
                "[class*='jobDescription']"
            ]),
            MAX_DESCRIPTION_LENGTH
        );
        const title = safeCell(posting.title || firstText([
            "[data-testid='job-title']",
            "[class*='job_title']",
            "h1",
            "h2"
        ]));
        const location = safeCell(structuredLocation(posting) || firstText([
            "[data-testid='job-location']",
            "[class*='location']",
            "[class*='Location']"
        ]));

        return {
            source: "Generic",
            position: title,
            company: safeCell(organizationName(posting) || firstText([
                "[data-testid='company-name']",
                "[class*='company_name']",
                "[class*='companyName']"
            ])),
            industry: safeCell(posting.industry || ""),
            requirements: description,
            pay: safeCell(formatSalary(posting) || findSalaryInVisibleText()),
            commute: location,
            employmentType: safeCell(normalizeEmploymentType(posting.employmentType) || firstText(["[class*='employment']"])),
            flags: detectFlags(title, location, description),
            link: safeCell(canonicalUrl())
        };
    }

    function selectScraper()
    {
        const host = hostname();

        if (host === "indeed.com" || host.endsWith(".indeed.com"))
        {
            return scrapeIndeed;
        }

        if (host === "ziprecruiter.com" || host.endsWith(".ziprecruiter.com"))
        {
            return scrapeZipRecruiter;
        }

        return scrapeGeneric;
    }

    function buildRow(fields)
    {
        const values = {
            position: fields.position,
            company: fields.company,
            sector: "-",
            industry: "-",
            requirements: formatRequirements(fields.requirements),
            pay: fields.pay,
            commute: normalizeCommute(fields.commute, fields.flags),
            employmentType: normalizeSheetEmploymentType(fields.employmentType),
            applicationSubmissionDate: formatToday(),
            applicationCount: "",
            responseSentiment: "Low",
            pocName: "",
            pocNumber: "",
            status: "",
            flags: fields.flags,
            link: fields.link,
            comments: ""
        };

        return COLUMN_ORDER.map((column) =>
            column === "requirements"
                ? tsvCell(values[column], { multiline: true })
                : tsvCell(values[column])
        ).join("\t");
    }

    function scrape()
    {
        const posting = readStructuredPosting();
        const fields = selectScraper()(posting);

        return {
            ok: true,
            row: buildRow(fields),
            fields
        };
    }

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) =>
    {
        if (message?.type !== "SCRAPE_JOB_ROW")
        {
            return false;
        }

        try
        {
            sendResponse(scrape());
        }
        catch (error)
        {
            sendResponse({
                ok: false,
                error: error?.message || "The posting could not be scraped."
            });
        }

        return false;
    });
})();
