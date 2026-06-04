import os
import glob

html_files = glob.glob('frontend/templates/frontend/*.html')

script_to_inject = """
    <!-- Mobile App-like Transition -->
    <style>
        @media (max-width: 767px) {
            body {
                opacity: 0;
                transform: translateY(15px) scale(0.98);
                transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1), transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            }
            body.page-loaded {
                opacity: 1;
                transform: translateY(0) scale(1);
            }
            body.page-exit {
                opacity: 0;
                transform: translateY(-10px) scale(0.98);
            }
        }
    </style>
    <script>
        document.addEventListener('DOMContentLoaded', () => {
            if (window.innerWidth <= 767) {
                // Initial load animation
                requestAnimationFrame(() => {
                    document.body.classList.add('page-loaded');
                });

                // Link click transitions
                document.querySelectorAll('a').forEach(link => {
                    link.addEventListener('click', (e) => {
                        const href = link.getAttribute('href');
                        const target = link.getAttribute('target');
                        if (href && href.startsWith('/') && !href.startsWith('#') && target !== '_blank' && !e.ctrlKey && !e.metaKey) {
                            e.preventDefault();
                            document.body.classList.remove('page-loaded');
                            document.body.classList.add('page-exit');
                            setTimeout(() => {
                                window.location.href = href;
                            }, 300); // match transition duration
                        }
                    });
                });
            } else {
                // Ensure visibility on desktop if resized
                document.body.style.opacity = '1';
                document.body.style.transform = 'none';
            }
        });
        
        // Handle back/forward navigation cache
        window.addEventListener('pageshow', (event) => {
            if (event.persisted && window.innerWidth <= 767) {
                document.body.classList.remove('page-exit');
                document.body.classList.add('page-loaded');
            }
        });
    </script>
"""

count = 0
for file_path in html_files:
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if "Mobile App-like Transition" not in content and '</body>' in content:
        # inject before </body>
        content = content.replace('</body>', script_to_inject + '\n</body>')
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        count += 1

print(f"Injected animation script into {count} files out of {len(html_files)}.")
