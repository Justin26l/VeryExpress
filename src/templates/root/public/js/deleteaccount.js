// Self-service account deletion page.
//
// Sends the access token the same way the rest of the app does — Authorization + X-Auth-Index —
// and clears the stored tokens on success, because the account is gone the moment the tombstone
// is written: keeping a token the server will now reject only produces confusing 401s.

(function () {
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

    button.addEventListener("click", function () {
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
                return response.json().then(function (body) {
                    return { ok: response.ok, status: response.status, body: body };
                });
            })
            .then(function (outcome) {
                if (!outcome.ok) {
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
})();
