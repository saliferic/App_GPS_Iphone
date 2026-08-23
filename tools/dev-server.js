/* ═══════════════════════════════════════════════════════════════════════════════
   SERVEUR STATIQUE DE DEV — `node tools/dev-server.js` (ou `npm start`)

   Sert le dossier du projet en HTTP local, sans dépendance. Nécessaire pour
   travailler sur l'app dans un vrai navigateur : Chrome refuse la géolocalisation
   à une origine `file://` (voir AGENTS.md, section compatibilité navigateurs).
   Même logique de service statique que `tests/app.e2e.js`, port fixe ici (8080)
   pour que `.vscode/launch.json` puisse pointer dessus.
   ═══════════════════════════════════════════════════════════════════════════════ */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const PORT   = Number(process.argv[2] || process.env.PORT || 8080);

const TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',   '.json': 'application/json',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
    '.ogg': 'audio/ogg', '.mp4': 'video/mp4', '.webp': 'image/webp',
};

const serveur = http.createServer((req, res) => {
    // On ne sert que sous la racine : `decodeURIComponent` puis `path.normalize`
    // empêchent un `..` de remonter ailleurs sur le disque.
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const abs = path.join(RACINE, path.normalize(rel).replace(/^(\.\.[\\/])+/, ''));
    if (!abs.startsWith(RACINE)) { res.writeHead(403); res.end(); return; }
    fs.readFile(abs, (err, data) => {
        if (err) { res.writeHead(404); res.end('introuvable'); return; }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(abs).toLowerCase()] || 'application/octet-stream' });
        res.end(data);
    });
});

serveur.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        // Un serveur de dev tourne déjà sur ce port (F5 pressé une deuxième fois) :
        // rien à faire, il sert déjà l'app.
        console.log(`Port ${PORT} déjà occupé — un serveur y répond probablement déjà.`);
        process.exit(0);
    }
    throw err;
});

serveur.listen(PORT, '127.0.0.1', () => {
    console.log(`Serveur GPS Récompenses prêt sur http://127.0.0.1:${PORT}`);
});
