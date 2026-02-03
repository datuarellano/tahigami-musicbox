// Simple console log to verify JavaScript is loaded
console.log('Tahigami Musicbox JavaScript loaded successfully!');

// DOM Content Loaded Event
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM fully loaded and parsed');
    
    // Example: Add interactive functionality
    const header = document.querySelector('header h1');
    if (header) {
        header.addEventListener('click', function() {
            alert('Welcome to Tahigami Musicbox!');
        });
    }
});
