const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');

// Configuramos el "Cartero" con la cuenta de Gmail del gimnasio
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'comunicaciones.storm@gmail.com', // Poner el mail oficial acá
        pass: 'azokqmlfmjppodug' // Poner las 16 letras sin espacios
    }
});

const app = express();
// Si la nube nos da un puerto lo usamos, sino usamos el 3000 localmente
const PORT = process.env.PORT || 3000;

// --- Middlewares ---
// Esto permite que tu app del celu (storm-nativa) se comunique sin bloqueos
app.use(cors()); 
// Esto permite que el servidor entienda la información que le mandemos en formato JSON
app.use(express.json()); 

// --- Configuración de la Base de Datos ---
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root', 
    password: process.env.DB_PASSWORD || '14090645', 
    database: process.env.DB_NAME || 'storm_db'
};

// --- Rutas (Endpoints) ---

// Esta es una ruta de prueba. Cuando entremos a la raíz del servidor, nos va a saludar.
app.get('/', (req, res) => {
    res.send('¡El servidor de STORM Training está funcionando a la perfección! 🚀');
});

// =========================================================
// --- Endpoint para LOGIN ---
// =========================================================
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Faltan datos (Email o contraseña)' });
    }

    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        
        const query = 'SELECT * FROM usuarios WHERE email = ? AND dni = ?';
        const [rows] = await connection.execute(query, [email, password]);

        if (rows.length > 0) {
            res.json({ usuario: rows[0] });
        } else {
            res.status(401).json({ error: 'Email o contraseña incorrecta.' });
        }
    } catch (error) {
        console.error("Error en login:", error);
        res.status(500).json({ error: 'Error interno del servidor' });
    } finally {
        if (connection) await connection.end();
    }
});

// =========================================================
// --- Endpoint de Perfil ---
// =========================================================
app.get('/api/perfil/:id', async (req, res) => {
    const usuarioId = req.params.id;

    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        
        const [users] = await connection.execute('SELECT nombre, apellido, dni, email, telefono, apto_medico FROM usuarios WHERE id = ?', [usuarioId]);
        
        if (users.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const [subs] = await connection.execute(`
            SELECT s.fecha_inicio, s.fecha_vencimiento, p.nombre as plan_nombre 
            FROM suscripciones s 
            JOIN planes p ON s.plan_id = p.id 
            WHERE s.usuario_id = ?
        `, [usuarioId]);

        res.json({
            datos_personales: users[0],
            suscripcion: subs.length > 0 ? subs[0] : null
        });

    } catch (error) {
        console.error('Error al obtener perfil:', error);
        res.status(500).json({ error: 'Error en el servidor' });
    } finally {
        if (connection) await connection.end();
    }
});

// =========================================================
// --- Endpoints de Reservas de Clases ---
// =========================================================
app.post('/api/reservas', async (req, res) => {
    const { usuario_id, clase_id } = req.body;

    if (!usuario_id || !clase_id) {
        return res.status(400).json({ error: 'Faltan datos para la reserva' });
    }

    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        
        const [datosPlan] = await connection.execute(`
            SELECT p.cant_clases 
            FROM suscripciones s 
            JOIN planes p ON s.plan_id = p.id 
            WHERE s.usuario_id = ?
        `, [usuario_id]);

        if (datosPlan.length === 0) {
            return res.status(400).json({ error: 'No tenés una suscripción activa.' });
        }

        const limiteClases = datosPlan[0].cant_clases;

        const [misReservas] = await connection.execute('SELECT COUNT(*) as total FROM reservas WHERE usuario_id = ?', [usuario_id]);
        const clasesConsumidas = misReservas[0].total;

        if (clasesConsumidas >= limiteClases) {
            return res.status(400).json({ error: 'Límite alcanzado. Ya consumiste todas las clases de tu plan.' });
        }

        const [clases] = await connection.execute('SELECT cupo_maximo FROM clases WHERE id = ?', [clase_id]);
        if (clases.length === 0) return res.status(404).json({ error: 'Clase no encontrada' });
        
        const cupoMaximo = clases[0].cupo_maximo;
        const [reservasActuales] = await connection.execute('SELECT COUNT(*) as total FROM reservas WHERE clase_id = ?', [clase_id]);
        const ocupados = reservasActuales[0].total;

        if (ocupados >= cupoMaximo) {
            return res.status(400).json({ error: 'La clase ya está llena' });
        }

        const [reservaPrevia] = await connection.execute('SELECT id FROM reservas WHERE usuario_id = ? AND clase_id = ?', [usuario_id, clase_id]);
        if (reservaPrevia.length > 0) {
            return res.status(400).json({ error: 'Ya estás anotado en esta clase' });
        }

        await connection.execute('INSERT INTO reservas (clase_id, usuario_id) VALUES (?, ?)', [clase_id, usuario_id]);

        res.json({ mensaje: '¡Reserva confirmada con éxito!' });

    } catch (error) {
        console.error('Error en la reserva:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    } finally {
        if (connection) await connection.end();
    }
});

// Cancelar Reserva
app.delete('/api/reservas', async (req, res) => {
    const { usuario_id, clase_id } = req.body;

    if (!usuario_id || !clase_id) {
        return res.status(400).json({ error: 'Faltan datos para cancelar' });
    }

    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        
        const [resultado] = await connection.execute(
            'DELETE FROM reservas WHERE usuario_id = ? AND clase_id = ?', 
            [usuario_id, clase_id]
        );

        if (resultado.affectedRows === 0) {
            return res.status(400).json({ error: 'No tenías una reserva en esta clase' });
        }

        res.json({ mensaje: 'Reserva cancelada, cupo liberado.' });

    } catch (error) {
        console.error('Error al cancelar:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    } finally {
        if (connection) await connection.end();
    }
});

// =========================================================
// --- Endpoints para GESTIÓN DE ALUMNOS ---
// =========================================================

app.get('/api/alumnos', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        // Le sacamos los JOINs para que lea los datos reales y directos del usuario
        const query = `
            SELECT 
                id, nombre, apellido, dni, email, telefono, profe_asignado,
                nivel, objetivo, fecha_baja, motivo_baja, 
                COALESCE(plan_actual, 'Sin plan') AS plan_actual,
                COALESCE(estado_cuenta, 'sin abono') AS estado_cuenta
            FROM usuarios 
            WHERE rol = 'alumno'
        `;
        const [alumnos] = await connection.execute(query);
        res.json(alumnos);
    } catch (error) {
        console.error('🔴 ERROR AL LEER ALUMNOS:', error);
        res.status(500).json({ error: 'Error interno al leer de MySQL' });
    } finally {
        if (connection) await connection.end();
    }
});

app.post('/api/alumnos', async (req, res) => {
    const { nombre, apellido, dni, email, telefono, plan_actual, profe_asignado, nivel, objetivo } = req.body;
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        
        // Asignamos el DNI como contraseña provisional por defecto para que la base de datos no rechace el registro
        const passwordProvisional = dni || '123456';

        const query = `
            INSERT INTO usuarios 
            (nombre, apellido, dni, email, telefono, password, rol, plan_actual, profe_asignado, nivel, objetivo, estado_cuenta) 
            VALUES (?, ?, ?, ?, ?, ?, 'alumno', ?, ?, ?, ?, 'activa')
        `;
        
        const params = [
            nombre || '', 
            apellido || '', 
            dni || '', 
            email || '', 
            telefono || '', 
            passwordProvisional,
            plan_actual || 'Sin plan', 
            profe_asignado || 'Sin asignar', 
            nivel || 'Principiante', 
            objetivo || 'Estética y salud'
        ];
        
        await connection.execute(query, params);
        res.json({ mensaje: 'Socio creado con éxito' });
    } catch (error) {
        console.error('🔴 ERROR AL CREAR SOCIO:', error);
        res.status(500).json({ error: 'Error al crear socio' });
    } finally {
        if (connection) await connection.end();
    }
});

app.put('/api/alumnos/:id/profe', async (req, res) => {
    const idAlumno = req.params.id;
    const { nuevoProfe } = req.body;
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        await connection.execute('UPDATE usuarios SET profe_asignado = ? WHERE id = ?', [nuevoProfe, idAlumno]);
        res.json({ mensaje: '¡Profesor actualizado!' });
    } catch (error) {
        res.status(500).json({ error: 'Error interno al actualizar en la base de datos' });
    } finally {
        if (connection) await connection.end();
    }
});

app.put('/api/alumnos/:id/perfil', async (req, res) => {
    const idAlumno = req.params.id;
    const { nombre, apellido, dni, email, telefono, plan_actual, nivel, objetivo, profe_asignado } = req.body;
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const query = `
            UPDATE usuarios 
            SET nombre = ?, apellido = ?, dni = ?, email = ?, telefono = ?, plan_actual = ?, nivel = ?, objetivo = ?, profe_asignado = ? 
            WHERE id = ?
        `;
        // Red de seguridad: si algo llega indefinido, lo forzamos a texto para que MySQL no explote
        const params = [
            nombre || '', 
            apellido || '', 
            dni || '', 
            email || '', 
            telefono || '', 
            plan_actual || 'Sin plan', 
            nivel || 'Intermedio', 
            objetivo || 'Estética y salud', 
            profe_asignado || 'Sin asignar', 
            idAlumno
        ];
        
        await connection.execute(query, params);
        res.json({ mensaje: '¡Perfil actualizado con éxito!' });
    } catch (error) {
        console.error('🔴 ERROR EN EDITAR PERFIL:', error);
        res.status(500).json({ error: 'Error interno al actualizar perfil' });
    } finally {
        if (connection) await connection.end();
    }
});

app.put('/api/alumnos/:id/estado', async (req, res) => {
    const idAlumno = req.params.id;
    const { estado, fecha_baja, motivo_baja } = req.body; 
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const query = 'UPDATE usuarios SET estado_cuenta = ?, fecha_baja = ?, motivo_baja = ? WHERE id = ?';
        
        const params = [
            estado !== undefined ? estado : 'vencida',
            fecha_baja ? fecha_baja : null,
            motivo_baja ? motivo_baja : null,
            idAlumno
        ];

        await connection.execute(query, params);
        res.json({ mensaje: '¡Estado actualizado con éxito!' });
    } catch (error) {
        console.error('🔴 ERROR CRITICO EN CAMBIAR ESTADO:', error);
        res.status(500).json({ error: 'Error al cambiar estado' });
    } finally {
        if (connection) await connection.end();
    }
});

// =========================================================
// --- Endpoint para las Estadísticas del DASHBOARD ---
// =========================================================
app.get('/api/dashboard/stats', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        
        const [rsTotal] = await connection.execute("SELECT COUNT(*) as total FROM usuarios WHERE rol = 'alumno'");
        const [rsActivos] = await connection.execute("SELECT COUNT(DISTINCT usuario_id) as activos FROM suscripciones WHERE estado = 'activa'");
        
        const queryCaja = `SELECT COALESCE(SUM(monto), 0) as total_ingresos FROM pagos_caja WHERE MONTH(fecha_pago) = MONTH(CURRENT_DATE()) AND YEAR(fecha_pago) = YEAR(CURRENT_DATE())`;
        const [rsIngresos] = await connection.execute(queryCaja);

        const queryGrafico = `SELECT p.nombre AS plan, COUNT(s.id) AS cantidad FROM planes p LEFT JOIN suscripciones s ON p.id = s.plan_id AND s.estado = 'activa' GROUP BY p.id, p.nombre ORDER BY cantidad DESC`;
        const [rsGrafico] = await connection.execute(queryGrafico);

        let vencenPronto = 0;
        let vencidos = 0;
        try {
            const [rsVencen] = await connection.execute("SELECT COUNT(*) as total FROM suscripciones WHERE estado = 'activa' AND fecha_fin BETWEEN CURRENT_DATE() AND DATE_ADD(CURRENT_DATE(), INTERVAL 7 DAY)");
            vencenPronto = rsVencen[0].total;
            
            const [rsVencidosData] = await connection.execute("SELECT COUNT(DISTINCT usuario_id) as total FROM suscripciones WHERE estado = 'vencida'");
            vencidos = rsVencidosData[0].total;
        } catch (e) {}

        const sinAcceso = rsTotal[0].total - rsActivos[0].activos;

        res.json({
            totalSocios: rsTotal[0]?.total || 0,
            sociosActivos: rsActivos[0]?.activos || 0,
            ingresosMes: rsIngresos[0]?.total_ingresos || 0,
            graficoPlanes: rsGrafico,
            alertas: { vencenPronto, vencidos, sinAcceso }
        });

    } catch (error) {
        res.status(500).json({ error: 'Error interno' });
    } finally {
        if (connection) await connection.end();
    }
});

// =========================================================
// --- Endpoints para PROFESORES ---
// =========================================================
app.get('/api/profesores', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute("SELECT * FROM usuarios WHERE rol = 'profe'");
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Error interno' });
    } finally {
        if (connection) await connection.end();
    }
});

app.post('/api/profesores', async (req, res) => {
    const { nombre, apellido, dni, email, telefono } = req.body;
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const query = "INSERT INTO usuarios (nombre, apellido, dni, email, telefono, rol, password) VALUES (?, ?, ?, ?, ?, 'profe', ?)";
        await connection.execute(query, [nombre, apellido, dni, email, telefono, dni]);
        res.json({ mensaje: 'Profesor agregado con éxito' });
    } catch (error) {
        res.status(500).json({ error: 'Error interno' });
    } finally {
        if (connection) await connection.end();
    }
});

// 3. EDITAR un Profesor
app.put('/api/profesores/:id', async (req, res) => {
    const idProfe = req.params.id;
    const { nombre, apellido, dni, email, telefono } = req.body;
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const query = 'UPDATE usuarios SET nombre = ?, apellido = ?, dni = ?, email = ?, telefono = ? WHERE id = ? AND rol = "profe"';
        await connection.execute(query, [nombre, apellido, dni, email, telefono, idProfe]);
        res.json({ mensaje: '¡Profesor actualizado con éxito!' });
    } catch (error) {
        console.error("Error al editar profe:", error);
        res.status(500).json({ error: 'Error interno' });
    } finally {
        if (connection) await connection.end();
    }
});

// 4. ELIMINAR un Profesor
app.delete('/api/profesores/:id', async (req, res) => {
    const idProfe = req.params.id;
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        await connection.execute('DELETE FROM usuarios WHERE id = ? AND rol = "profe"', [idProfe]);
        res.json({ mensaje: 'Profesor eliminado del sistema.' });
    } catch (error) {
        console.error("Error al eliminar profe:", error);
        res.status(500).json({ error: 'Error interno' });
    } finally {
        if (connection) await connection.end();
    }
});

// =========================================================
// --- Endpoints para CONTROL DE ACCESOS ---
// =========================================================
app.post('/api/accesos', async (req, res) => {
    const { usuario_id, estado, notas } = req.body;
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        await connection.execute(
            "INSERT INTO accesos (usuario_id, fecha_hora, estado, notas) VALUES (?, NOW(), ?, ?)",
            [usuario_id, estado, notas || '']
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Error interno' });
    } finally {
        if (connection) await connection.end();
    }
});

app.get('/api/accesos/hoy', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const query = `
            SELECT a.id, a.fecha_hora, a.estado, a.notas, u.nombre, u.apellido, u.dni,
                   (SELECT p.nombre FROM suscripciones s JOIN planes p ON s.plan_id = p.id 
                    WHERE s.usuario_id = u.id AND s.estado = 'activa' LIMIT 1) as plan_nombre
            FROM accesos a
            JOIN usuarios u ON a.usuario_id = u.id
            WHERE DATE(a.fecha_hora) = CURRENT_DATE()
            ORDER BY a.fecha_hora DESC
        `;
        const [rows] = await connection.execute(query);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Error interno' });
    } finally {
        if (connection) await connection.end();
    }
});

app.get('/api/accesos/filtrar', async (req, res) => {
    const { fecha, horaInicio, horaFin, socioId } = req.query;
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        let query = `
            SELECT a.id, a.fecha_hora, a.estado, a.notas, u.nombre, u.apellido, u.dni,
                   (SELECT p.nombre FROM suscripciones s JOIN planes p ON s.plan_id = p.id 
                    WHERE s.usuario_id = u.id AND s.estado = 'activa' LIMIT 1) as plan_nombre
            FROM accesos a
            JOIN usuarios u ON a.usuario_id = u.id
            WHERE 1=1
        `;
        const params = [];
        if (fecha) { query += ` AND DATE(a.fecha_hora) = ?`; params.push(fecha); }
        if (horaInicio && horaFin) { query += ` AND TIME(a.fecha_hora) BETWEEN ? AND ?`; params.push(horaInicio, horaFin); }
        if (socioId) { query += ` AND a.usuario_id = ?`; params.push(socioId); }
        query += ` ORDER BY a.fecha_hora DESC`;

        const [rows] = await connection.execute(query, params);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Error interno' });
    } finally {
        if (connection) await connection.end();
    }
});



// =========================================================
// --- Endpoints para CAJA Y PAGOS ---
// =========================================================
app.get('/api/pagos', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const query = `
            SELECT p.*, u.nombre as socio_nombre, u.apellido as socio_apellido, u.dni 
            FROM pagos_caja p 
            LEFT JOIN usuarios u ON p.usuario_id = u.id 
            ORDER BY p.fecha_pago DESC
        `;
        const [rows] = await connection.execute(query);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Error interno' });
    } finally {
        if (connection) await connection.end();
    }
});

app.post('/api/pagos', async (req, res) => {
    const { usuario_id, tipo, monto, metodo_pago, categoria, concepto } = req.body;
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        await connection.beginTransaction(); // Empezamos la transacción segura

        // 1. Guardamos el ticket en tu caja (Tu código original)
        const query = `INSERT INTO pagos_caja (usuario_id, tipo, monto, metodo_pago, categoria, concepto, fecha_pago) VALUES (?, ?, ?, ?, ?, ?, NOW())`;
        await connection.execute(query, [usuario_id || null, tipo, monto, metodo_pago, categoria, concepto || '']);

        // 2. LA MAGIA: Si es un "Pago Cuota" y tiene un usuario asignado, le estiramos el vencimiento
        if (categoria === 'Pago Cuota' && usuario_id) {
            
            // Buscamos su último vencimiento
            const [suscripciones] = await connection.execute(
                'SELECT fecha_vencimiento FROM suscripciones WHERE usuario_id = ? ORDER BY id DESC LIMIT 1',
                [usuario_id]
            );

            let nuevaFechaVencimiento = new Date(); 
            const hoy = new Date();

            if (suscripciones.length > 0 && suscripciones[0].fecha_vencimiento) {
                const vencimientoActual = new Date(suscripciones[0].fecha_vencimiento);
                // Si estaba adelantado, sumamos desde su fecha futura. Si estaba vencido, sumamos desde hoy.
                if (vencimientoActual >= hoy) {
                    nuevaFechaVencimiento = vencimientoActual;
                }
            }

            // Sumamos 1 mes exacto
            nuevaFechaVencimiento.setMonth(nuevaFechaVencimiento.getMonth() + 1);
            const fechaStr = `${nuevaFechaVencimiento.getFullYear()}-${String(nuevaFechaVencimiento.getMonth()+1).padStart(2,'0')}-${String(nuevaFechaVencimiento.getDate()).padStart(2,'0')}`;

            // Actualizamos o insertamos en suscripciones
            if (suscripciones.length > 0) {
                await connection.execute(
                    `UPDATE suscripciones SET fecha_vencimiento = ?, estado = 'activa' WHERE usuario_id = ?`,
                    [fechaStr, usuario_id]
                );
            } else {
                await connection.execute(
                    `INSERT INTO suscripciones (usuario_id, fecha_vencimiento, estado) VALUES (?, ?, 'activa')`,
                    [usuario_id, fechaStr]
                );
            }

            // (Opcional) Si tenés una columna de estado en la tabla usuarios o alumnos, la actualizamos acá:
            // Vi que en tu GET hacés JOIN con 'usuarios', así que asumo que tu tabla principal se llama usuarios.
            await connection.execute(
                'UPDATE usuarios SET estado_cuenta = "activa" WHERE id = ?', 
                [usuario_id]
            );
        }

        await connection.commit(); // Confirmamos todos los cambios juntos
        res.json({ success: true });
        
    } catch (error) {
        if (connection) await connection.rollback(); // Si algo falla, deshacemos todo
        console.error("Error en pagos:", error);
        res.status(500).json({ error: 'Error interno' });
    } finally {
        if (connection) await connection.end();
    }
});

app.get('/api/pagos/filtrar', async (req, res) => {
    const { fechaDesde, horaDesde, fechaHasta, horaHasta, tipo, caja, categoria } = req.query;
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        let query = `
            SELECT p.*, u.nombre as socio_nombre, u.apellido as socio_apellido, u.dni 
            FROM pagos_caja p 
            LEFT JOIN usuarios u ON p.usuario_id = u.id 
            WHERE 1=1
        `;
        const params = [];

        if (fechaDesde && horaDesde) { query += ` AND p.fecha_pago >= ?`; params.push(`${fechaDesde} ${horaDesde}:00`); }
        if (fechaHasta && horaHasta) { query += ` AND p.fecha_pago <= ?`; params.push(`${fechaHasta} ${horaHasta}:59`); }
        if (tipo && tipo !== 'Todos') { query += ` AND p.tipo = ?`; params.push(tipo); }
        if (caja && caja !== 'Todas') { query += ` AND p.metodo_pago = ?`; params.push(caja); }
        if (categoria && categoria !== 'Todas') { query += ` AND p.categoria = ?`; params.push(categoria); }
        query += ` ORDER BY p.fecha_pago DESC`;

        const [rows] = await connection.execute(query, params);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Error interno' });
    } finally {
        if (connection) await connection.end();
    }
});

// =========================================================
// --- Endpoints para CALENDARIO GENERAL ---
// =========================================================
app.get('/api/clases', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        // Agregamos la subconsulta mágica para contar las reservas reales
        const query = `
            SELECT 
                c.*, 
                u.nombre as profe_nombre, 
                u.apellido as profe_apellido,
                (SELECT COUNT(*) FROM reservas r WHERE r.clase_id = c.id) as total_anotados
            FROM clases c 
            LEFT JOIN usuarios u ON c.profe_id = u.id 
            ORDER BY c.fecha_hora ASC
        `;
        const [rows] = await connection.execute(query);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Error interno' });
    } finally {
        if (connection) await connection.end();
    }
});

app.post('/api/clases', async (req, res) => {
    const { titulo, profe_id, fecha_hora, cupo_maximo } = req.body;
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const query = `INSERT INTO clases (titulo, profe_id, fecha_hora, cupo_maximo) VALUES (?, ?, ?, ?)`;
        await connection.execute(query, [titulo, profe_id, fecha_hora, cupo_maximo || 15]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Error interno' });
    } finally {
        if (connection) await connection.end();
    }
});

// ---------------------------------------------------------
// RUTAS DE ASISTENCIA Y CUPOS (LAS QUE FALTABAN)
// ---------------------------------------------------------

// Traer alumnos anotados y el cupo máximo
app.get('/api/clases/:id/alumnos', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const claseId = req.params.id;

        const [clase] = await connection.execute('SELECT cupo_maximo FROM clases WHERE id = ?', [claseId]);
        const cupoMaximo = clase.length > 0 ? clase[0].cupo_maximo : 15;

        const query = `
            SELECT r.id as reserva_id, r.usuario_id, u.nombre, u.apellido, r.estado, r.asistencia 
            FROM reservas r 
            JOIN usuarios u ON r.usuario_id = u.id 
            WHERE r.clase_id = ?
            ORDER BY u.apellido, u.nombre
        `;
        const [alumnos] = await connection.execute(query, [claseId]); 
        
        res.json({ cupoMaximo, alumnos });
    } catch (error) {
        res.status(500).json({ error: "Error interno del servidor" });
    } finally {
        if (connection) await connection.end();
    }
});

// Cambiar Asistencia (Presente/Pendiente)
app.put('/api/reservas/:id/asistencia', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const reservaId = req.params.id;
        const { asistencia } = req.body; 

        await connection.execute('UPDATE reservas SET asistencia = ? WHERE id = ?', [asistencia, reservaId]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Error interno" });
    } finally {
        if (connection) await connection.end();
    }
});

// ---------------------------------------------------------
// RUTAS DE ADMINISTRACIÓN DE TURNOS
// ---------------------------------------------------------

app.put('/api/clases/:id/cupo', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        await connection.execute('UPDATE clases SET cupo_maximo = ? WHERE id = ?', [req.body.cupo, req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Error al actualizar cupo" });
    } finally {
        if (connection) await connection.end();
    }
});

app.post('/api/clases/:id/alumnos', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const { usuario_id, tipo } = req.body; 
        const claseId = req.params.id;

        if (tipo === 'fijo') {
            const [clase] = await connection.execute('SELECT titulo, fecha_hora FROM clases WHERE id = ?', [claseId]);
            const { titulo, fecha_hora } = clase[0];
            
            const query = `
                INSERT INTO reservas (clase_id, usuario_id, estado, asistencia)
                SELECT c.id, ?, 'reservada', 'pendiente'
                FROM clases c
                WHERE c.titulo = ? 
                  AND TIME(c.fecha_hora) = TIME(?) 
                  AND DAYOFWEEK(c.fecha_hora) = DAYOFWEEK(?)
                  AND c.fecha_hora >= ?
                  AND NOT EXISTS (SELECT 1 FROM reservas r2 WHERE r2.clase_id = c.id AND r2.usuario_id = ?)
            `;
            await connection.execute(query, [usuario_id, titulo, fecha_hora, fecha_hora, fecha_hora, usuario_id]);
        } else {
            await connection.execute('INSERT INTO reservas (clase_id, usuario_id, estado, asistencia) VALUES (?, ?, "reservada", "pendiente")', [claseId, usuario_id]);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Error al agregar alumno" });
    } finally {
        if (connection) await connection.end();
    }
});

app.delete('/api/clases/:clase_id/alumnos/:usuario_id', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const { clase_id, usuario_id } = req.params;
        const { tipo } = req.query; 

        if (tipo === 'fijo') {
            const [clase] = await connection.execute('SELECT titulo, fecha_hora FROM clases WHERE id = ?', [clase_id]);
            const { titulo, fecha_hora } = clase[0];

            const query = `
                DELETE r FROM reservas r
                JOIN clases c ON r.clase_id = c.id
                WHERE r.usuario_id = ?
                  AND c.titulo = ?
                  AND TIME(c.fecha_hora) = TIME(?)
                  AND DAYOFWEEK(c.fecha_hora) = DAYOFWEEK(?)
                  AND c.fecha_hora >= ?
            `;
            await connection.execute(query, [usuario_id, titulo, fecha_hora, fecha_hora, fecha_hora]);
        } else {
            await connection.execute('DELETE FROM reservas WHERE clase_id = ? AND usuario_id = ?', [clase_id, usuario_id]);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Error al eliminar" });
    } finally {
        if (connection) await connection.end();
    }
});

// =========================================================
// --- Endpoints para BASE DE RUTINAS ---
// =========================================================

// 1. Obtener todas las rutinas
app.get('/api/rutinas', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute('SELECT * FROM rutinas ORDER BY fecha_creacion DESC');
        res.json(rows);
    } catch (error) {
        console.error("Error al obtener rutinas:", error);
        res.status(500).json({ error: 'Error interno' });
    } finally {
        if (connection) await connection.end();
    }
});

// 2. Crear una nueva rutina
app.post('/api/rutinas', async (req, res) => {
    const { titulo, descripcion_bloques, creador_id } = req.body;
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        // Guardamos todo el paquete (ejercicios, nivel, categoría) adentro del campo descripcion_bloques
        const query = 'INSERT INTO rutinas (titulo, descripcion_bloques, creador_id) VALUES (?, ?, ?)';
        await connection.execute(query, [titulo, descripcion_bloques, creador_id || 1]);
        res.json({ success: true });
    } catch (error) {
        console.error("Error al crear rutina:", error);
        res.status(500).json({ error: 'Error interno' });
    } finally {
        if (connection) await connection.end();
    }
});

// 3. Borrar una rutina
app.delete('/api/rutinas/:id', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        await connection.execute('DELETE FROM rutinas WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error("Error al borrar rutina:", error);
        res.status(500).json({ error: 'Error interno' });
    } finally {
        if (connection) await connection.end();
    }
});

// 4. Editar una rutina existente
app.put('/api/rutinas/:id', async (req, res) => {
    const { titulo, descripcion_bloques } = req.body;
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const query = 'UPDATE rutinas SET titulo = ?, descripcion_bloques = ? WHERE id = ?';
        await connection.execute(query, [titulo, descripcion_bloques, req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error("Error al editar rutina:", error);
        res.status(500).json({ error: 'Error interno' });
    } finally {
        if (connection) await connection.end();
    }
});

// Ruta para mandar los mails masivos
app.post('/api/comunicaciones/enviar', async (req, res) => {
    const { destinatarios, asunto, cuerpo } = req.body;

    if (!destinatarios || destinatarios.length === 0) {
        return res.status(400).json({ error: 'No hay destinatarios válidos' });
    }

    try {
        // Ejecutamos el envío de correos a todos en paralelo
        const promesas = destinatarios.map(email => {
            return transporter.sendMail({
                from: '"STORM Gym" <comunicaciones.storm@gmail.com>', // Tiene que ser el mismo mail de arriba
                to: email,
                subject: asunto,
                text: cuerpo
            });
        });

        await Promise.all(promesas);
        res.json({ mensaje: '¡Todos los correos fueron enviados con éxito!' });
    } catch (error) {
        console.error('Error enviando correos:', error);
        res.status(500).json({ error: 'Fallo al enviar algunos correos.' });
    }
});

// ==========================================
// RUTAS PARA EL CATÁLOGO DE EJERCICIOS (LIBRERÍA)
// ==========================================

// Obtener todo el catálogo
app.get('/api/catalogo-ejercicios', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute('SELECT * FROM catalogo_ejercicios ORDER BY nombre ASC');
        res.json(rows);
    } catch (error) {
        console.error('Error al obtener catálogo:', error);
        res.status(500).json({ error: 'Error del servidor' });
    } finally {
        if (connection) await connection.end();
    }
});

// Agregar un nuevo ejercicio al catálogo (Ideal para un futuro panel de admin)
app.post('/api/catalogo-ejercicios', async (req, res) => {
    const { nombre, grupo_muscular, descripcion, url_video, url_imagen } = req.body;
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const query = `
            INSERT INTO catalogo_ejercicios 
            (nombre, grupo_muscular, descripcion, url_video, url_imagen) 
            VALUES (?, ?, ?, ?, ?)
        `;
        const params = [nombre, grupo_muscular || null, descripcion || null, url_video || null, url_imagen || null];
        await connection.execute(query, params);
        res.json({ mensaje: 'Ejercicio agregado al catálogo' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(400).json({ error: 'El ejercicio ya existe en el catálogo' });
        } else {
            console.error('Error al crear ejercicio:', error);
            res.status(500).json({ error: 'Error del servidor' });
        }
    } finally {
        if (connection) await connection.end();
    }
});

// =========================================================
// --- Endpoints para PLANIFICADOR DE RUTINAS ---
// =========================================================

// 1. CARGAR la planificación guardada de un alumno
app.get('/api/alumnos/:id/planificacion', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const query = 'SELECT * FROM planificacion_rutinas WHERE usuario_id = ? ORDER BY fecha_asignada ASC';
        const [rows] = await connection.execute(query, [req.params.id]);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Error interno al cargar planificacion' });
    } finally {
        if (connection) await connection.end();
    }
});

// 2. GUARDAR la nueva planificación
app.post('/api/alumnos/:id/planificacion', async (req, res) => {
    const usuario_id = req.params.id;
    const { planificacion, fechaMin, fechaMax } = req.body;
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        
        // Magia: Borramos solo lo que estaba en este rango de fechas para no duplicar si el profe mueve un bloque
        await connection.execute(
            'DELETE FROM planificacion_rutinas WHERE usuario_id = ? AND fecha_asignada BETWEEN ? AND ?',
            [usuario_id, fechaMin, fechaMax]
        );

        // Insertamos los bloques nuevos que nos mandó el Frontend
        if (planificacion && planificacion.length > 0) {
            for (let bloque of planificacion) {
                await connection.execute(
                    'INSERT INTO planificacion_rutinas (usuario_id, fecha_asignada, nombre_bloque) VALUES (?, ?, ?)',
                    [usuario_id, bloque.fecha_asignada, bloque.nombre_bloque]
                );
            }
        }
        res.json({ success: true, mensaje: "Planificación guardada" });
    } catch (error) {
        console.error("Error guardando planificación:", error);
        res.status(500).json({ error: 'Error interno al guardar' });
    } finally {
        if (connection) await connection.end();
    }
});

// =========================================================
// --- Endpoints para TIENDA Y BENEFICIOS ---
// =========================================================

// 1. OBTENER TODO (GET)
app.get('/api/tienda/productos', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute('SELECT * FROM tienda_productos ORDER BY id DESC');
        res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Error interno' }); } finally { if (connection) await connection.end(); }
});

app.get('/api/tienda/beneficios', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute('SELECT * FROM tienda_beneficios ORDER BY id DESC');
        res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Error interno' }); } finally { if (connection) await connection.end(); }
});

// GUARDAR o EDITAR PRODUCTO (POST)
app.post('/api/tienda/productos', async (req, res) => {
    // Agregamos imagen_url a lo que recibimos del frontend
    const { id, nombre, precio, stock, descripcion, imagen_url } = req.body;
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        if (id) {
            await connection.execute(
                'UPDATE tienda_productos SET nombre=?, precio=?, stock=?, descripcion=?, imagen_url=? WHERE id=?', 
                [nombre, precio, stock, descripcion, imagen_url || '', id]
            );
        } else {
            await connection.execute(
                'INSERT INTO tienda_productos (nombre, precio, stock, descripcion, imagen_url) VALUES (?, ?, ?, ?, ?)', 
                [nombre, precio, stock, descripcion, imagen_url || '']
            );
        }
        res.json({ success: true });
    } catch (e) { 
        console.error(e);
        res.status(500).json({ error: 'Error al guardar producto' }); 
    } finally { 
        if (connection) await connection.end(); 
    }
});

app.post('/api/tienda/beneficios', async (req, res) => {
    const { id, nombre, descuento, arroba, aclaracion } = req.body;
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        if (id) {
            await connection.execute('UPDATE tienda_beneficios SET nombre=?, descuento=?, arroba=?, aclaracion=? WHERE id=?', [nombre, descuento, arroba, aclaracion, id]);
        } else {
            await connection.execute('INSERT INTO tienda_beneficios (nombre, descuento, arroba, aclaracion) VALUES (?, ?, ?, ?)', [nombre, descuento, arroba, aclaracion]);
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Error al guardar beneficio' }); } finally { if (connection) await connection.end(); }
});

// 3. ELIMINAR (DELETE)
app.delete('/api/tienda/:tipo/:id', async (req, res) => {
    const { tipo, id } = req.params;
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const tabla = tipo === 'producto' ? 'tienda_productos' : 'tienda_beneficios';
        await connection.execute(`DELETE FROM ${tabla} WHERE id = ?`, [id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Error al eliminar' }); } finally { if (connection) await connection.end(); }
});
// --- Inicialización del Servidor ---
app.listen(PORT, () => {
    console.log(`🔥 Servidor backend corriendo en http://localhost:${PORT}`);
});