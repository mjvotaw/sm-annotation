if('serviceWorker' in navigator) {window.addEventListener('load', () => {navigator.serviceWorker.register('/sm-annotation/sw.js', { scope: '/sm-annotation/' })})}