const mysql = require('mysql2/promise');

// ACORDATE DE PONER LOS DATOS DE TU NUBE ACÁ:
const dbConfig = { 
    host: 'bi35lzduvmqywojdiq3f-mysql.services.clever-cloud.com', 
    user: 'urzppyg1ah8homwr', 
    password: 'u7g87HbWAi0PDogKFffd', 
    database: 'bi35lzduvmqywojdiq3f' 
};

async function sincronizarTurbo() {
    console.log('⚡ Iniciando sincronización TURBO...');
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        
        // 1. Buscamos a los alumnos con días fijos
        const [alumnos] = await connection.execute("SELECT id, dias_fijos FROM usuarios WHERE dias_fijos IS NOT NULL AND dias_fijos != ''");
        console.log(`📊 Procesando ${alumnos.length} alumnos...`);

        // 2. Traemos TODAS las clases futuras a la memoria de la compu de una sola vez
        const [clases] = await connection.execute("SELECT id, DAYOFWEEK(fecha_hora) as dia, DATE_FORMAT(fecha_hora, '%H:%i') as hora FROM clases WHERE fecha_hora >= NOW()");
        
        // Armamos un diccionario rápido en memoria
        const mapaClases = {};
        for (const c of clases) {
            const key = `${c.dia}-${c.hora}`;
            if (!mapaClases[key]) mapaClases[key] = [];
            mapaClases[key].push(c.id);
        }

        // 3. Limpiamos reservas futuras pendientes para no duplicar
        const idsUsuarios = alumnos.map(a => a.id);
        if (idsUsuarios.length > 0) {
            console.log('🧹 Limpiando grillas viejas...');
            const placeholders = idsUsuarios.map(() => '?').join(',');
            await connection.execute(`
                DELETE r FROM reservas r
                JOIN clases c ON r.clase_id = c.id
                WHERE r.usuario_id IN (${placeholders}) AND r.asistencia = 'pendiente' AND c.fecha_hora >= NOW()
            `, idsUsuarios);
        }

        // 4. Armamos un mega-paquete con todas las reservas juntas
        const mapaDias = { 'DOM':1, 'LUN':2, 'MAR':3, 'MIE':4, 'JUE':5, 'VIE':6, 'SAB':7 };
        const paqueteReservas = [];

        for (const alumno of alumnos) {
            const turnos = alumno.dias_fijos.split(',').map(t => t.trim());
            for (const turno of turnos) {
                const partes = turno.split(' ');
                if (partes.length === 2) {
                    const diaNum = mapaDias[partes[0].toUpperCase()];
                    const horaMinuto = partes[1]; // ej "18:00"
                    
                    if (diaNum && horaMinuto) {
                        const key = `${diaNum}-${horaMinuto}`;
                        const clasesIds = mapaClases[key] || [];
                        for (const claseId of clasesIds) {
                            paqueteReservas.push([claseId, alumno.id, 'reservada', 'pendiente']);
                        }
                    }
                }
            }
        }

        // 5. Inyectamos el mega-paquete en la base de datos de a 2000 juntas
        console.log(`🚀 Preparando ${paqueteReservas.length} reservas para insertar. ¡Agarrate fuerte!`);
        if (paqueteReservas.length > 0) {
            let insertadas = 0;
            const chunkSize = 2000; // De a 2000 para que MySQL no se atragante
            for (let i = 0; i < paqueteReservas.length; i += chunkSize) {
                const chunk = paqueteReservas.slice(i, i + chunkSize);
                const placeholders = chunk.map(() => '(?, ?, ?, ?)').join(',');
                const flatChunk = chunk.flat();
                await connection.execute(`INSERT IGNORE INTO reservas (clase_id, usuario_id, estado, asistencia) VALUES ${placeholders}`, flatChunk);
                insertadas += chunk.length;
            }
        }

        console.log('\n✅ ¡MAGIA PURA! Sincronización Turbo completada en un par de segundos.');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        if(connection) await connection.end();
    }
}

sincronizarTurbo();