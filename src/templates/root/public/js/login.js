
document.addEventListener("DOMContentLoaded", function() {
    // add event listener to login button
    document.querySelector("#localLoginBtn").addEventListener("click", function() {
        // call api /auth/local
        fetch("/auth/local", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email: document.querySelector("#email").value,
                password: document.querySelector("#password").value
            })
        })
        .then(async (res) => {
            if(res.status === 302) {
                const data = await res.json();
                if(data.result?.url){
                    window.location.href = data.result?.url;
                }
                else { 
                    alert("Login successful, but no redirect URL provided.");
                };
            } 
            else {
                const data = await res.json();
                alert("Login failed: " + data.message);
            }
        })
        .catch((err) => {
            console.error("Error during login:", err);
            alert("An error occurred during login. Please try again later.");
        });
    });

        document.querySelector("#localRegisterBtn").addEventListener("click", function() {
        // call api /auth/local
        fetch("/auth/register", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email: document.querySelector("#email").value,
                password: document.querySelector("#password").value
            })
        })
        .then(async (res) => {
            if(res.status === 201) {
                alert("Registration successful. You can now log in.");
            }
        })
        .catch((err) => {
            console.error("Error during registration:", err);
            alert("An error occurred during registration. Please try again later.");
        });
    });
});