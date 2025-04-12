let jsonData = {};

document.addEventListener("DOMContentLoaded", function () {
  jsonData = {
    accessToken: localStorage.getItem("accessToken"),
    accessTokenIndex: localStorage.getItem("accessTokenIndex"),
    refreshToken: localStorage.getItem("refreshToken"),
    refreshTokenIndex: localStorage.getItem("refreshTokenIndex"),
  };
  document.querySelector("#tokenData").innerHTML = JSON.stringify(jsonData, null, 2);
});