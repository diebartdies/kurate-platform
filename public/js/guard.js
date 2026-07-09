// Route Guard: Redirects unauthorized direct access back to index.html
(function() {
    // Check if the 18+ flag is missing in localStorage
    if (!localStorage.getItem('is18Plus')) {
        // Kick them back to the landing page immediately
        window.location.replace('/index.html');
    }
})();