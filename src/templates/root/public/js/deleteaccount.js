// Self-service account deletion page.
//
// Sends the access token the same way the rest of the app does — Authorization + X-Auth-Index —
// and clears the stored tokens on success, because the account is gone the moment the tombstone
// is written: keeping a token the server will now reject only produces confusing 401s.

// The page loads this script from <head>, so it must wait for the DOM: at parse time the
// button does not exist yet and getElementById would return null.
document.addEventListener("DOMContentLoaded", function () {
    var button = document.getElementById("deleteAccountBtn");
    var input = document.getElementById("confirmInput");
    var result = document.getElementById("deleteResult");

    if (!button || !input || !result) return;

    function clearTokens() {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("accessTokenIndex");
        localStorage.removeItem("refreshToken");
        localStorage.removeItem("refreshTokenIndex");
    }

    function render(data) {
        result.textContent = JSON.stringify(data, null, 2);
    }

    /**
     * Deletion is self-service and the server resolves the account from the token alone, so with no
     * token there is nothing to delete: sending an empty `Bearer ` would only earn a bare 401 that
     * reads like a server fault. Point at the login page instead.
     *
     * Both credentials are required — `Authentication.middleware` treats them as one requirement — so
     * a half-populated store counts as "not signed in" rather than as an API call.
     *
     * Note this file is copied into a project once and never overwritten, so a project generated
     * before these checks existed keeps the old behaviour until it is updated by hand.
     */
    function signedIn() {
        return !!localStorage.getItem("accessToken") && !!localStorage.getItem("accessTokenIndex");
    }

    function notSignedIn() {
        render({
            status: 401,
            error: "You are not signed in. Deletion is self-service and the server takes the account " +
                "from your access token, so sign in first.",
            signIn: "/login",
        });
    }

    /**
     * A 401 from the server means the stored credential was not accepted — expired, or already
     * tombstoned. Deliberately does NOT clear it: the request may equally have failed for a reason
     * that has nothing to do with the token, and dropping the session on any failure would sign the
     * user out of a working account. Sign in again and retry; the login flow overwrites both tokens.
     */
    function sessionRejected(outcome) {
        render({
            status: outcome.status,
            error: "Your session was not accepted, so nothing was deleted. It may have expired — " +
                "sign in again and retry.",
            detail: outcome.body,
            signIn: "/login",
        });
    }

    button.addEventListener("click", function () {
        if (!signedIn()) {
            notSignedIn();
            return;
        }

        if (input.value !== "DELETE") {
            render({ error: 'Type DELETE in the box to confirm.' });
            return;
        }

        button.disabled = true;
        render({ status: "Deleting…" });

        fetch("/api/auth/delete-account", {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + (localStorage.getItem("accessToken") || ""),
                "X-Auth-Index": localStorage.getItem("accessTokenIndex") || "",
            },
        })
            .then(function (response) {
                // read as text first: an error response may not be JSON (a proxy or the
                // express error handler can return HTML), and response.json() would then
                // reject and hide the real status behind a parse error
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
            })
            .then(function (outcome) {
                if (!outcome.ok) {
                    // 401 means the credential was not accepted. Say what to do about it rather than
                    // printing a raw error body the user cannot act on — see sessionRejected for why
                    // the stored tokens are left alone.
                    if (outcome.status === 401) {
                        sessionRejected(outcome);
                        button.disabled = false;
                        return;
                    }

                    render({ status: outcome.status, error: outcome.body });
                    button.disabled = false;
                    return;
                }

                clearTokens();
                render({
                    status: "Account deleted. You have been signed out.",
                    result: outcome.body,
                });
                input.value = "";
            })
            .catch(function (err) {
                render({ error: String(err) });
                button.disabled = false;
            });
    });
});
