(function analyticsDashboard() {
    "use strict";

    var state = {
        days: 30,
        loading: false
    };

    var authScreen = document.getElementById("auth-screen");
    var authDescription = document.getElementById("auth-description");
    var loginForm = document.getElementById("login-form");
    var loginMessage = document.getElementById("login-message");
    var setupNote = document.getElementById("setup-note");
    var dashboard = document.getElementById("dashboard");
    var errorBanner = document.getElementById("error-banner");
    var errorMessage = document.getElementById("error-message");
    var updatedLabel = document.getElementById("updated-label");
    var rangeSelect = document.getElementById("range-select");
    var deferredInstallPrompt = null;

    function updateConnectionStatus() {
        var status = document.getElementById("connection-status");
        if (!status) return;
        var online = navigator.onLine;
        status.classList.toggle("is-offline", !online);
        status.querySelector("span").textContent = online ? "Live" : "Offline";
    }

    function isRunningStandalone() {
        return window.matchMedia("(display-mode: standalone)").matches ||
            window.navigator.standalone === true;
    }

    function syncInstallButtons(show) {
        document.querySelectorAll("[data-install-app]").forEach(function (button) {
            button.hidden = !show || isRunningStandalone();
        });
    }

    window.addEventListener("beforeinstallprompt", function (event) {
        event.preventDefault();
        deferredInstallPrompt = event;
        syncInstallButtons(true);
    });

    window.addEventListener("appinstalled", function () {
        deferredInstallPrompt = null;
        syncInstallButtons(false);
    });

    document.querySelectorAll("[data-install-app]").forEach(function (button) {
        button.addEventListener("click", async function () {
            if (!deferredInstallPrompt) return;
            deferredInstallPrompt.prompt();
            await deferredInstallPrompt.userChoice;
            deferredInstallPrompt = null;
            syncInstallButtons(false);
        });
    });

    window.addEventListener("online", function () {
        updateConnectionStatus();
        if (!dashboard.hidden) loadData();
    });
    window.addEventListener("offline", updateConnectionStatus);
    updateConnectionStatus();

    if ("serviceWorker" in navigator) {
        window.addEventListener("load", function () {
            navigator.serviceWorker.register("/analytics-sw.js", { scope: "/" }).catch(function () {
                /* Installation support is optional; analytics remains usable in the browser. */
            });
        });
    }

    function showLogin(message) {
        dashboard.hidden = true;
        authScreen.hidden = false;
        setupNote.hidden = true;
        loginForm.hidden = false;
        authDescription.textContent = message || "Enter the password you set in Netlify to continue.";
        window.setTimeout(function () {
            document.getElementById("dashboard-password").focus();
        }, 50);
    }

    function showSetup() {
        dashboard.hidden = true;
        authScreen.hidden = false;
        loginForm.hidden = true;
        setupNote.hidden = false;
        authDescription.textContent = "One small setup step is needed before this dashboard can receive private data.";
    }

    function showDashboard() {
        authScreen.hidden = true;
        dashboard.hidden = false;
    }

    function setLoading(loading) {
        state.loading = loading;
        document.getElementById("refresh-button").disabled = loading;
        if (loading) {
            errorBanner.hidden = true;
            updatedLabel.textContent = "Loading the latest activity…";
        }
    }

    function formatNumber(value) {
        return new Intl.NumberFormat().format(Number(value) || 0);
    }

    function formatRelativeTime(value) {
        var milliseconds = Date.now() - new Date(value).getTime();
        var minutes = Math.max(0, Math.round(milliseconds / 60_000));
        if (minutes < 1) return "Just now";
        if (minutes < 60) return minutes + "m ago";
        var hours = Math.round(minutes / 60);
        if (hours < 24) return hours + "h ago";
        var days = Math.round(hours / 24);
        return days + "d ago";
    }

    function text(value) {
        return String(value == null ? "" : value);
    }

    function clearLoading(element) {
        element.classList.remove("is-loading");
        element.innerHTML = "";
    }

    function renderMetrics(metrics) {
        document.querySelectorAll("[data-metric]").forEach(function (element) {
            var key = element.getAttribute("data-metric");
            element.textContent = formatNumber(metrics[key]);
            element.classList.remove("skeleton-text");
        });
        document.querySelector("[data-metric-note='downloadRate']").textContent =
            (metrics.downloadRate || 0) + "% of visitors";
    }

    function renderTimeline(timeline) {
        var chart = document.getElementById("timeline-chart");
        clearLoading(chart);
        var visible = timeline;
        if (state.days > 90) {
            visible = [];
            for (var index = 0; index < timeline.length; index += 7) {
                var week = timeline.slice(index, index + 7);
                visible.push({
                    date: week[0].date,
                    views: week.reduce(function (sum, day) { return sum + day.views; }, 0),
                    visitors: week.reduce(function (sum, day) { return sum + day.visitors; }, 0)
                });
            }
        }
        var max = Math.max.apply(null, visible.map(function (day) {
            return Math.max(day.views, day.visitors);
        }).concat([1]));

        visible.forEach(function (day, index) {
            var group = document.createElement("div");
            group.className = "timeline-day";
            group.title = new Date(day.date + "T12:00:00").toLocaleDateString(undefined, {
                month: "short",
                day: "numeric"
            }) + ": " + day.views + " views, " + day.visitors + " visitors";

            ["views", "visitors"].forEach(function (key) {
                var bar = document.createElement("span");
                bar.className = "timeline-bar timeline-bar--" + key;
                bar.style.height = Math.max(2, (day[key] / max) * 100) + "%";
                bar.style.animationDelay = Math.min(index * 12, 280) + "ms";
                group.appendChild(bar);
            });
            chart.appendChild(group);
        });
    }

    function renderRanking(id, items) {
        var list = document.getElementById(id);
        clearLoading(list);
        var max = Math.max.apply(null, items.map(function (item) { return item.value; }).concat([1]));
        if (!items.length) {
            list.innerHTML = '<div class="ranking-row"><span class="ranking-row__label">No data yet</span><span class="ranking-row__value">0</span></div>';
            return;
        }

        items.forEach(function (item) {
            var row = document.createElement("div");
            row.className = "ranking-row";

            var main = document.createElement("div");
            main.className = "ranking-row__main";
            var label = document.createElement("span");
            label.className = "ranking-row__label";
            label.textContent = text(item.label);
            var track = document.createElement("div");
            track.className = "ranking-row__track";
            var fill = document.createElement("div");
            fill.className = "ranking-row__fill";
            fill.style.width = ((item.value / max) * 100) + "%";
            track.appendChild(fill);
            main.append(label, track);

            var value = document.createElement("span");
            value.className = "ranking-row__value";
            value.textContent = formatNumber(item.value);
            row.append(main, value);
            list.appendChild(row);
        });
    }

    function renderDevices(items, totalVisitors) {
        var list = document.getElementById("devices-list");
        clearLoading(list);
        var ordered = ["Desktop", "Mobile", "Tablet"];
        ordered.forEach(function (label) {
            var match = items.find(function (item) { return item.label === label; });
            var value = match ? match.value : 0;
            var percentage = totalVisitors ? Math.round((value / totalVisitors) * 100) : 0;
            var item = document.createElement("div");
            item.className = "device-item";
            var name = document.createElement("span");
            name.textContent = label;
            var figure = document.createElement("strong");
            figure.textContent = percentage + "%";
            item.append(name, figure);
            list.appendChild(item);
        });
    }

    function renderVisitors(visitors) {
        var body = document.getElementById("visitors-body");
        var empty = document.getElementById("empty-state");
        var tableWrap = document.querySelector(".table-wrap");
        body.innerHTML = "";

        if (!visitors.length) {
            tableWrap.hidden = true;
            empty.hidden = false;
            return;
        }

        tableWrap.hidden = false;
        empty.hidden = true;
        visitors.forEach(function (visitor) {
            var row = document.createElement("tr");

            var visitorCell = document.createElement("td");
            var visitorId = document.createElement("span");
            visitorId.className = "visitor-id";
            visitorId.textContent = visitor.visitorId;
            visitorCell.appendChild(visitorId);

            var lastSeen = document.createElement("td");
            lastSeen.textContent = formatRelativeTime(visitor.lastSeen);

            var location = document.createElement("td");
            location.textContent = [visitor.city, visitor.country].filter(Boolean).join(", ") || "Unknown";

            var context = document.createElement("td");
            context.textContent = visitor.device + " · " + visitor.browser + " · " + visitor.referrer;

            var pagesCell = document.createElement("td");
            var tags = document.createElement("div");
            tags.className = "page-tags";
            visitor.pages.slice(0, 4).forEach(function (page) {
                var tag = document.createElement("span");
                tag.className = "page-tag";
                tag.textContent = page;
                tags.appendChild(tag);
            });
            if (visitor.pages.length > 4) {
                var more = document.createElement("span");
                more.className = "page-tag";
                more.textContent = "+" + (visitor.pages.length - 4);
                tags.appendChild(more);
            }
            pagesCell.appendChild(tags);

            var resume = document.createElement("td");
            var status = document.createElement("span");
            status.className = "status-pill" + (visitor.resumeDownloaded ? " status-pill--yes" : "");
            status.textContent = visitor.resumeDownloaded ? "Downloaded" : "No";
            resume.appendChild(status);

            row.append(visitorCell, lastSeen, location, context, pagesCell, resume);
            body.appendChild(row);
        });
    }

    function render(data) {
        renderMetrics(data.metrics);
        renderTimeline(data.timeline);
        renderRanking("pages-list", data.topPages);
        renderRanking("referrers-list", data.referrers);
        renderRanking("countries-list", data.countries);
        renderDevices(data.devices, data.metrics.pageViews);
        renderVisitors(data.recentVisitors);
        updatedLabel.textContent = "Updated " + new Date(data.generatedAt).toLocaleTimeString(undefined, {
            hour: "numeric",
            minute: "2-digit"
        });
    }

    async function loadData() {
        if (state.loading) return;
        setLoading(true);
        try {
            var response = await fetch("/api/analytics?days=" + state.days, {
                credentials: "same-origin",
                headers: { Accept: "application/json" }
            });
            var data = await response.json().catch(function () { return {}; });
            if (response.status === 401) {
                showLogin();
                return;
            }
            if (data.code === "NOT_CONFIGURED") {
                showSetup();
                return;
            }
            if (!response.ok) throw new Error(data.error || "Analytics could not be loaded.");
            showDashboard();
            render(data);
        } catch (error) {
            showDashboard();
            errorMessage.textContent = error.message || "Analytics could not be loaded.";
            errorBanner.hidden = false;
            updatedLabel.textContent = "Last refresh failed";
        } finally {
            setLoading(false);
        }
    }

    loginForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        var button = loginForm.querySelector("button");
        var password = document.getElementById("dashboard-password").value;
        loginMessage.textContent = "";
        button.disabled = true;
        button.textContent = "Opening…";
        try {
            var response = await fetch("/api/analytics/auth", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password: password })
            });
            var result = await response.json().catch(function () { return {}; });
            if (response.status === 503) {
                showSetup();
                return;
            }
            if (!response.ok) throw new Error(result.error || "Could not sign in.");
            loginForm.reset();
            await loadData();
        } catch (error) {
            loginMessage.textContent = error.message || "Could not sign in.";
        } finally {
            button.disabled = false;
            button.textContent = "Open dashboard";
        }
    });

    rangeSelect.addEventListener("change", function () {
        state.days = Number(rangeSelect.value) || 30;
        loadData();
    });
    document.getElementById("refresh-button").addEventListener("click", loadData);
    document.getElementById("retry-button").addEventListener("click", loadData);
    document.getElementById("logout-button").addEventListener("click", async function () {
        await fetch("/api/analytics/logout", {
            method: "POST",
            credentials: "same-origin"
        }).catch(function () {});
        showLogin("You’ve been logged out. Enter your password to return.");
    });

    loadData();
})();
