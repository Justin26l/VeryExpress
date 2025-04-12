
document.addEventListener("DOMContentLoaded", function() {
    console.log('Exchange Tokens from /auth/token');
    let sessionCode = new URLSearchParams(location.search).get('code');
    fetch(
        '/auth/token?code=' + sessionCode, {
            method: 'POST'
        }
    )
        .then((res) => res.text())
        .then((data) => {
            const jsonData = JSON.parse(data);
            document.querySelector("#tokenData").innerHTML = JSON.stringify(jsonData, null, 2);
            localStorage.setItem('accessToken', jsonData.result.accessToken);
            localStorage.setItem('accessTokenIndex', jsonData.result.accessTokenIndex);
            localStorage.setItem('refreshToken', jsonData.result.refreshToken);
            localStorage.setItem('refreshTokenIndex', jsonData.result.refreshTokenIndex);
        });
});