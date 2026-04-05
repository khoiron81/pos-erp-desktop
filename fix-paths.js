const fs = require('fs');
const path = require('path');

const rendererDir = path.join(__dirname, 'renderer');

// Get all HTML files
const htmlFiles = fs.readdirSync(rendererDir).filter(f => f.endsWith('.html'));

htmlFiles.forEach(file => {
    const filePath = path.join(rendererDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace absolute paths with relative paths
    // href="/_next/  -> href="./_next/
    content = content.replace(/href="\/_next\//g, 'href="./_next/');
    // src="/_next/  -> src="./_next/
    content = content.replace(/src="\/_next\//g, 'src="./_next/');
    // href="/manifest.json -> href="./manifest.json
    content = content.replace(/href="\/manifest\.json/g, 'href="./manifest.json');
    // href="/favicon.ico -> href="./favicon.ico
    content = content.replace(/href="\/favicon\.ico/g, 'href="./favicon.ico');
    // href="/icons/ -> href="./icons/
    content = content.replace(/href="\/icons\//g, 'href="./icons/');
    
    // Also fix paths inside script content (RSC payload)
    // "/_next/static/ -> "./_next/static/
    content = content.replace(/"\\"\/_next\/static\//g, '"\\".\/_next\/static\/');
    // "/_next/static/ in regular strings
    content = content.replace(/"\/_next\/static\//g, '".\/_next\/static\/');
    
    // Fix static/chunks references in RSC data
    content = content.replace(/\\\"static\/chunks\//g, '\\\".\/static\/chunks\/');
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Fixed: ${file}`);
});

console.log(`\nDone! Fixed ${htmlFiles.length} HTML files.`);
