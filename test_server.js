require('http').get('http://localhost:3000/clients', (res) => {
    let rawData = '';
    res.on('data', (chunk) => { rawData += chunk; });
    res.on('end', () => { console.log('Loaded length:', rawData.length); });
});
