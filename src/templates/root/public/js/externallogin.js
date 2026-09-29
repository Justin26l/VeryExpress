// External identity (broker SSO) sign-in glue.
//
// The login page renders one button per configured sign-in method, each carrying its provider id in a
// `data-provider` attribute, and the broker's own init script defines a global that turns
// `(providerId)` into a fresh ID token — for Firebase, `signInWithPopup` followed by `getIdToken()`.
//
// This file owns nothing vendor specific. It calls that global and hands the token to
// POST /api/auth/external, the only endpoint in the system that accepts a non-vex credential. The
// exchange consumes the token and answers with a vex session redirect; from that point on the client
// holds only vex tokens and nothing here runs again.
//
// Configuration arrives as `window.__vexExternalLogin`, rendered inline by the login page:
//   { getToken: "<global name>", resumeRedirect: "<global name>", signInMethod: "popup"|"redirect",
//     config: { ...broker public config, from env... }, problems: [...] }
//
// Two entry points, and neither the page nor this file needs to know which mode is in use:
//   - a button calls getToken(providerId); in "redirect" mode the page navigates away before that
//     promise ever settles
//   - on page load, resumeRedirect() completes a redirect sign-in, or resolves null

document.addEventListener("DOMContentLoaded", function () {
    var settings = window.__vexExternalLogin || {};
    var getTokenName = settings.getToken;
    var problems = settings.problems || [];

    var buttons = document.querySelectorAll ? document.querySelectorAll(".externalLoginBtn") : [];

    /**
     * Broker SDKs report a misconfigured client with something generic — Firebase's
     * `auth/internal-error` says nothing about the cause. The login page sends along what the server
     * could determine, so a developer is not left reading a network trace.
     */
    function report(message) {
        if (problems.length > 0) {
            message += "\n\nServer-side configuration problems:\n- " + problems.join("\n- ");
        }

        // alert rather than a DOM node: the login page has no result container.
        alert(message);
    }

    function exchange(idToken) {
        return fetch("/api/auth/external", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken: idToken }),
        }).then(function (response) {
            // read as text first: an error response may not be JSON (a proxy or the express error
            // handler can return HTML), and response.json() would then reject and hide the real status
            return response.text().then(function (text) {
                var body;
                try {
                    body = text ? JSON.parse(text) : {};
                }
                catch (e) {
                    body = { raw: text };
                }

                return { ok: response.ok, status: response.status, body: body };
            });
        });
    }

    /**
     * Complete a redirect sign-in.
     *
     * A no-op in popup mode, so this runs unconditionally: the redirect path cannot be distinguished
     * from an ordinary page load until the broker answers, and it must be asked on every load to catch
     * the return.
     */
    function resume() {
        var resumeName = settings.resumeRedirect;
        var fn = resumeName ? window[resumeName] : undefined;
        if (typeof fn !== "function") return;

        Promise.resolve()
            .then(function () { return fn(); })
            .then(function (idToken) {
                if (!idToken) return;   // not a return from a redirect sign-in
                return exchange(idToken);
            })
            .then(function (outcome) {
                if (!outcome) return;
                if (outcome.ok && outcome.body && outcome.body.result && outcome.body.result.url) {
                    window.location.href = outcome.body.result.url;
                    return;
                }
                report("External sign-in failed (" + outcome.status + "): " + JSON.stringify(outcome.body));
            })
            .catch(function (err) {
                report("External sign-in error: " + String(err));
            });
    }

    Array.prototype.forEach.call(buttons, function (button) {
        button.addEventListener("click", function () {
            var getToken = getTokenName ? window[getTokenName] : undefined;
            if (typeof getToken !== "function") {
                report(
                    "External sign-in is not configured: window." + getTokenName +
                    " is missing. Check the broker's init script."
                );
                return;
            }

            button.disabled = true;

            Promise.resolve()
                .then(function () { return getToken(button.getAttribute("data-provider")); })
                .then(function (idToken) {
                    if (!idToken) throw new Error("the configured getToken() resolved with no ID token");
                    return exchange(idToken);
                })
                .then(function (outcome) {
                    // mirrors the local flow: the server answers with the session redirect, and the
                    // /logincallback page performs the code-for-tokens exchange
                    if (outcome.ok && outcome.body && outcome.body.result && outcome.body.result.url) {
                        window.location.href = outcome.body.result.url;
                        return;
                    }

                    button.disabled = false;
                    report("External sign-in failed (" + outcome.status + "): " + JSON.stringify(outcome.body));
                })
                .catch(function (err) {
                    button.disabled = false;
                    report("External sign-in error: " + String(err));
                });
        });
    });

    resume();
});
