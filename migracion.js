const mysql = require('mysql2/promise');
const xlsx = require('xlsx');
const bcrypt = require('bcrypt');

const dbConfig = {
    host: 'localhost',
    user: 'root', 
    password: '14090645', 
    database: 'storm_db'
};

function formatExcelDate(excelDate) {
    if (!excelDate) return null;
    
    let resultStr = null;

    try {
        if (typeof excelDate === 'string') {
            if (excelDate.includes('/')) {
                const parts = excelDate.split('/');
                if (parts.length === 3) resultStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
            } else {
                resultStr = excelDate;
            }
        } else if (typeof excelDate === 'number') {
            const date = new Date((excelDate - 25569) * 86400 * 1000);
            if (!isNaN(date.getTime())) {
                resultStr = date.toISOString().split('T')[0];
            }
        }

        // LA OPCIÓN NUCLEAR: Filtro estricto por RegEx.
        // Solo permite el paso si el formato es puramente numérico y exacto (ej: 1990-12-31)
        if (resultStr && typeof resultStr === 'string') {
            const regex = /^\d{4}-\d{2}-\d{2}$/; 
            if (regex.test(resultStr)) {
                const year = parseInt(resultStr.substring(0, 4));
                if (year >= 1900 && year <= 2100) return resultStr;
            }
        }
        
        // Si no pasó la prueba matemática, es basura. Lo descartamos.
        return null;
    } catch (error) {
        return null;
    }
}

async function migrarDatos() {
    console.log('⚡ Iniciando migración de STORM Training...');
    
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ Conectado a la base de datos storm_db.');

        const workbook = xlsx.readFile('socios_activos.xlsx');
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
        
        console.log(`📊 Se encontraron ${data.length} alumnos en el Excel. Procesando...`);

        for (const fila of data) {
            
            // --- A. GESTIÓN DEL PLAN ---
            const nombrePlan = fila['Abonos Activos'];
            let planId = null;

            if (nombrePlan) {
                const [planRows] = await connection.execute('SELECT id FROM planes WHERE nombre = ?', [nombrePlan]);
                
                if (planRows.length > 0) {
                    planId = planRows[0].id;
                } else {
                    const [insertPlan] = await connection.execute('INSERT INTO planes (nombre) VALUES (?)', [nombrePlan]);
                    planId = insertPlan.insertId;
                    console.log(`   📝 Nuevo plan registrado: ${nombrePlan}`);
                }
            }

            // --- B. GESTIÓN DEL USUARIO ---
            const dni = String(fila['Documento']).trim();
            const email = fila['Email'] ? fila['Email'].trim() : `${dni}@storm.com`; 
            
            const [userRows] = await connection.execute('SELECT id FROM usuarios WHERE dni = ?', [dni]);
            let usuarioId;

            if (userRows.length > 0) {
                usuarioId = userRows[0].id;
            } else {
                const salt = await bcrypt.genSalt(10);
                const hashedPassword = await bcrypt.hash(dni, salt);
                
                const aptoMedicoStr = String(fila['Apto Médico']).toLowerCase();
                const tieneApto = aptoMedicoStr.includes('sin') ? false : true;

                // Las fechas pasan sí o sí filtradas por la validación estricta
                const fechaNac = formatExcelDate(fila['Fecha de Nacimiento']) || '1990-01-01';

                const [insertUser] = await connection.execute(`
                    INSERT INTO usuarios (dni, nombre, apellido, email, telefono, fecha_nacimiento, password, rol, apto_medico)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'alumno', ?)
                `, [
                    dni,
                    fila['Nombre'],
                    fila['Apellido'],
                    email,
                    fila['Teléfono'] || null,
                    fechaNac,
                    hashedPassword,
                    tieneApto
                ]);
                
                usuarioId = insertUser.insertId;
            }

            // --- C. GESTIÓN DE LA SUSCRIPCIÓN ---
            if (usuarioId && planId) {
                const fechaInicio = formatExcelDate(fila['Inicio Abono']) || '2024-01-01';
                const fechaVenc = formatExcelDate(fila['Vencimiento Abono']) || '2024-12-31';

                await connection.execute(`
                    INSERT INTO suscripciones (usuario_id, plan_id, fecha_inicio, fecha_vencimiento, precio_abono, saldo)
                    VALUES (?, ?, ?, ?, ?, ?)
                `, [
                    usuarioId,
                    planId,
                    fechaInicio,
                    fechaVenc,
                    fila['Precio Abono'] || 0,
                    fila['Saldo'] || 0
                ]);
            }
        }

        console.log('🚀 ¡MIGRACIÓN COMPLETADA CON ÉXITO!');
        console.log('Toda la información ya está disponible en tu base de datos relacional.');

    } catch (error) {
        console.error('❌ Error durante la migración:', error);
    } finally {
        if (connection) await connection.end();
    }
}

migrarDatos();