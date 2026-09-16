const express = require('express');
const multer = require('multer');
const path = require('path');

const app = express();

// Railway inyecta el puerto en la variable de entorno PORT
const PORT = process.env.PORT || 3000;

// Multer guarda los archivos subidos en memoria (no se escriben a disco)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Servir los archivos estáticos de la carpeta "public"
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

/**
 * Convierte el contenido de un CSV (buffer) en un arreglo de objetos.
 * Espera un encabezado con columnas: id, campo, valor
 * (columnas adicionales se ignoran; el orden de columnas no importa).
 */
function parseCSV(buffer) {
  const texto = buffer.toString('utf-8').trim();
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lineas.length === 0) return [];

  const encabezados = lineas[0].split(',').map((h) => h.trim().toLowerCase());
  const idxId = encabezados.indexOf('id');
  const idxCampo = encabezados.indexOf('campo');
  const idxValor = encabezados.indexOf('valor');

  if (idxId === -1 || idxCampo === -1 || idxValor === -1) {
    throw new Error('El CSV debe tener las columnas: id, campo, valor');
  }

  return lineas.slice(1).map((linea) => {
    const valores = linea.split(',').map((v) => v.trim());
    return {
      id: valores[idxId] ?? '',
      campo: valores[idxCampo] ?? '',
      valor: valores[idxValor] ?? ''
    };
  });
}

// Paso 1: recibe ambos archivos, valida el formato y devuelve un resumen
app.post(
  '/api/importar',
  upload.fields([{ name: 'archivoA' }, { name: 'archivoB' }]),
  (req, res) => {
    try {
      const archivoA = req.files?.archivoA?.[0];
      const archivoB = req.files?.archivoB?.[0];

      if (!archivoA || !archivoB) {
        return res.status(400).json({ error: 'Debes subir el archivo del Sistema A y del Sistema B.' });
      }

      const datosA = parseCSV(archivoA.buffer);
      const datosB = parseCSV(archivoB.buffer);

      res.json({
        ok: true,
        nombreA: archivoA.originalname,
        nombreB: archivoB.originalname,
        totalA: datosA.length,
        totalB: datosB.length
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

// Paso 2: recibe ambos archivos otra vez y ejecuta la conciliación real
app.post(
  '/api/comparar',
  upload.fields([{ name: 'archivoA' }, { name: 'archivoB' }]),
  (req, res) => {
    try {
      const archivoA = req.files?.archivoA?.[0];
      const archivoB = req.files?.archivoB?.[0];

      if (!archivoA || !archivoB) {
        return res.status(400).json({ error: 'Debes subir el archivo del Sistema A y del Sistema B.' });
      }

      const datosA = parseCSV(archivoA.buffer);
      const datosB = parseCSV(archivoB.buffer);

      const mapaA = new Map(datosA.map((f) => [f.id, f]));
      const mapaB = new Map(datosB.map((f) => [f.id, f]));

      const todosLosIds = Array.from(new Set([...mapaA.keys(), ...mapaB.keys()])).sort();

      let coincidencias = 0;
      let diferencias = 0;
      let porRevisar = 0;

      const filas = todosLosIds.map((id) => {
        const filaA = mapaA.get(id);
        const filaB = mapaB.get(id);
        const campo = filaA?.campo || filaB?.campo || '(sin nombre)';

        let estado;
        let valorA = filaA ? filaA.valor : 'No encontrado';
        let valorB = filaB ? filaB.valor : 'No encontrado';

        if (filaA && filaB) {
          estado = filaA.valor === filaB.valor ? 'match' : 'diff';
        } else {
          estado = 'review';
        }

        if (estado === 'match') coincidencias++;
        if (estado === 'diff') diferencias++;
        if (estado === 'review') porRevisar++;

        return { id, campo, valorA, valorB, estado };
      });

      res.json({
        ok: true,
        resumen: { coincidencias, diferencias, porRevisar, total: filas.length },
        filas
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

// Cualquier ruta no encontrada devuelve el index.html (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Módulo de Conciliación de Información escuchando en el puerto ${PORT}`);
});
