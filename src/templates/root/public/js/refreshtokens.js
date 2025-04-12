document.addEventListener("DOMContentLoaded", function () {
  jsonPayload = {
    refreshToken: localStorage.getItem("refreshToken"),
    refreshTokenIndex: localStorage.getItem("refreshTokenIndex"),
  };

  fetch("/auth/refresh", {
    method: "POST",
    body: JSON.stringify(jsonPayload),
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": "Bearer " + localStorage.getItem("accessToken"),
      "X-Auth-Index": localStorage.getItem("accessTokenIndex")
    }
  })
  .then(res => res.json())
  .then((response) => {
    localStorage.setItem("accessToken", response.accessToken);
    localStorage.setItem("accessTokenIndex", response.accessTokenIndex);
    document.querySelector("#tokenData").innerHTML = JSON.stringify(response, null, 2);
  });
});