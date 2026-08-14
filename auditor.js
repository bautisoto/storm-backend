const mysql = require('mysql2/promise');

const dbConfig = {
    host: 'localhost',
    user: 'root', 
    password: '14090645', // <-- ¡PONÉ TU CONTRASEÑA ACÁ ANTES DE GUARDAR!
    database: 'storm_db'
};

function normalizar(texto) {
    if (!texto) return "";
    return texto.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
        .trim()
        .replace(/\s+/g, ' '); 
}

// ============================================================================
// LA PLANTILLA MAESTRA DE TURNOS FIJOS (LUNES A SÁBADO COMPLETOS)
// ============================================================================
const grillaFija = {
    "Lunes": {
        "07:00": { titulo: "Entrenamiento personalizado", cupo: 18, alumnos: ["Bissutti Agustin", "Burgos Emma Maria Alejandra", "De Nosi Laura", "Flecha Mariana", "Garavaglia Patricia", "Iribarren Pablo Ariel", "Novello Virginia", "Silva Luciano"] },
        "08:00": { titulo: "Entrenamiento personalizado", cupo: 15, alumnos: ["Arenas Lucas", "Bustamante Sabrina", "Chavez Lucia Magali", "Del Medico Zayat Malia Veronica", "Echeverry Juan Francisco", "Fernandez Dante", "Fernandez Matias", "Guzman Ramiro", "Mendoz Carolina", "Pellone Maria Antonella", "Rolon Natalia", "Ruiz Alejandra"] },
        "09:00": { titulo: "Entrenamiento personalizado", cupo: 15, alumnos: ["Alcantara Paula", "Betta Franco", "Dip Melina", "Fernandez Garcia Zoe", "Galliano Maria Jose", "Garavaglia Santino", "Guglielmo Paula", "Mainelli Agustina", "Martinez Ricardo", "Meneguzzo Valoria", "Vergara Celina"] },
        "10:00": { titulo: "Entrenamiento personalizado", cupo: 15, alumnos: ["Arias Bautista Santiago", "Arias Pintos Luciana", "Bengolea Juan Ignacio", "Cassin Santino", "Castillo Pintos Micky", "Cordoba Juliana", "Fernandez Tomas", "Figueroa Sandra", "Marchiaroli Agustina", "Magaldi Martin", "Pereyra Lourdes", "Rodriguez Valentina Magali", "Scaramilli Nicolas Donato", "Suarez Romero Rafael", "Ugaldenonandia Pilar"] },
        "15:00": { titulo: "Entrenamiento personalizado", cupo: 15, alumnos: ["Bafico Guadalupe", "Cacciatore Sandra", "Capozzolo Lourdes", "De Angelis Bruno", "Guillermo Noemi", "Iannuzzio Pedro Martin", "Juaristi Maria Ignacia", "Lopez Garcia Sebastian", "Martinez Fernando", "Mora Maria", "Reberte Mariana", "Villaluz Ignacio"] },
        "16:00": { titulo: "Entrenamiento personalizado", cupo: 15, alumnos: ["Briosso Gabriela", "Carrizo Edmundo", "Cattaneo Julian", "Costa Lara", "Dominguez Florencia", "Echeverry Horacio", "Fernandez Ramiro", "Gancia Federico", "Leonardo Facundo", "Murillo Lucia", "Perez Natalia", "Pinero Rocio", "Reato Beni", "Sodi Martina", "Vergara Leandro"] },
        "17:00": { titulo: "Entrenamiento personalizado", cupo: 18, alumnos: ["Altamura Candido", "Alvarez Juan Pablo", "Claros Migue", "Costa Rocio", "Costas Blanca", "Fernandez Elias", "Flores Blanco", "Gonzalez Miguenz Federico", "Gomez Ely", "Impellizzeri Maria Florencia", "Kopecek Pascual Martin", "Maccarone Lucas", "Pin Rodrigo", "Pellea Maria Antonieta", "Portillo Diego", "Portillo Juan Cruz", "Piva Dante Agustin", "Santoromi Melina", "Suarez Romero Rafael", "Tombolini Mariano"] },
        "18:00": { titulo: "Entrenamiento personalizado", cupo: 18, alumnos: ["Reima Carla", "Cadenas Renata", "Carbonero Ceto Josefina", "Costa Ignacio", "Damico Ingo", "Fernandez Alonso Santiago", "Fernandez Pame Joaquin", "Gonzalez Miguenz Federico", "Gomez Ely", "Natale Franco", "Navas Carolina", "Scaglioni Camila", "Semper Lucia", "Teveson Lucas", "Zocca Joaquin"] },
        "19:00": { titulo: "Entrenamiento personalizado", cupo: 18, alumnos: ["Briosso Fernanda", "Casella Hernan", "Claros Miguel", "Dias Jimena", "Francia Franco Lautaro", "Gancia Gaston Ezequiel", "Gomez Mercedes", "Longhini Ivan", "Macchi Juli", "Mendez Diaz Julieta", "Ortega Pilar", "Renna Belen", "Revichione Tomas", "Romagnoli Emanuel", "Vergara Rodrigo"] }
    },
    "Martes": {
        "07:00": { titulo: "Entrenamiento personalizado", cupo: 18, alumnos: ["Bissutti Agustin", "Burgos Emma Maria Alejandra", "Garavaglia Patricia", "Iribarren Pablo Ariel", "Novello Virginia", "Valdez Juan Ignacio"] },
        "08:00": { titulo: "Entrenamiento personalizado", cupo: 15, alumnos: ["Arena Lucas", "Bardelli Santa Marina", "Blanco Carla", "Chavez Lucia Magali", "Dip Melina", "Echeverry Juan Francisco", "Fernandez Alejandro", "Fernandez Dante", "Fernandez Sabrina", "Fernandez Matias", "Rodriguez Sebastian"] },
        "09:00": { titulo: "Entrenamiento personalizado", cupo: 15, alumnos: ["Alcantara Paula", "Armendariz Victoria", "Cordoba Juliana", "Echeverry Tomas", "Fernandez Tomas", "Figueroa Sandra", "Garavaglia Sandra", "Gimenez Lola", "Gutierrez Maximo", "Macchiaroli Agustina", "Magaldi Martin", "Medina Franco", "Mendoz Malena"] },
        "10:00": { titulo: "Entrenamiento personalizado", cupo: 15, alumnos: ["Arias Bautista Santiago", "Arias Pintos Luciana", "Baez Pina Fiorela", "Bravo Denise", "Castillo Pintos Micky", "Echeverry Tomas", "Gimenez Santian Juan Ignacio", "Mendoza Malena", "Repetto Rosana", "Rivero Alejandro"] },
        "15:00": { titulo: "Entrenamiento personalizado", cupo: 15, alumnos: ["Angeli Juan Martin", "Benazzo Giuliana", "Capozzolo Lourdes", "Catta Maria", "Costanza Camila", "Dimen Ladislao", "Fischer Valentina", "Grasso Santos Lautaro", "Mille Juan Cruz", "Pacheco Malena", "Rolon Estela", "Rolon Lautaro", "Sandej Nicolas", "Vilar Gonzalo"] },
        "16:00": { titulo: "Entrenamiento personalizado", cupo: 15, alumnos: ["Bafico Guadalupe", "Bolla Franco", "Cacciatore Sandra", "Cardozo Luana", "Di Mroca Agustin", "Fernandez Soledad", "Garavaglia Eimila", "Garavaglia Santino", "Juarez Rivero Ignacio", "Lopez Garcia Sebastian", "Martinez Fernando", "Milice Maria Virginia", "Reberte Mariana", "Sandej Nicolas", "Villaluz Ignacio"] },
        "17:00": { titulo: "Entrenamiento personalizado", cupo: 18, alumnos: ["Almiron Benicio", "Antoni Danila", "Bolla Max", "Briosso Gabriela", "Capozzolo Bautista", "Carrizo Edmundo", "Cattaneo Julian", "Dominguez Florencia", "Echeverry Horacio", "Fernandez Ramiro", "Gancia Federico", "Mata Melina", "Perez Natalia", "Pinero Rocio", "Reato Beni", "Sodi Martina", "Vergara Leandro"] },
        "18:00": { titulo: "Entrenamiento personalizado", cupo: 18, alumnos: ["Abasto Tiziano", "Alvarez Juan Pablo", "Casco Karina", "Casco Florencia", "Claros Migue", "Costa Rocio", "Costas Blanca", "Crucill Gonzalo", "Glavic Rocio", "Maccarone Lucas", "Portillo Diego", "Portillo Juan Cruz", "Piva Dante Agustin", "Pellea Agustin", "Suarez Romero Rafael", "Tombolini Mariano"] },
        "19:00": { titulo: "Entrenamiento personalizado", cupo: 18, alumnos: ["Bidigaray Tomas", "Boli Iñaki", "Bounezaim Bautista", "Calvet Tobias", "Martin Matias", "Miranda Tomas", "Natale Franco", "Navas Carolina", "Ortiz Rocio", "Pellegrino Emiliano Carlos", "Perez Pujol Lucia", "Rolon Natalia", "Scaglioni Camila", "Velazquez Lara", "Zocca Joaquin"] },
        "20:00": { titulo: "Entrenamiento personalizado", cupo: 18, alumnos: ["Briosso Fernanda", "Casella Hernan", "Claros Miguel", "Dias Jimena", "Francia Franco Lautaro", "Gancia Gaston Ezequiel", "Gomez Mercedes", "Longhini Ivan", "Macchi Juli", "Mendez Diaz Julieta", "Ortega Pilar", "Renna Belen", "Revichione Tomas", "Romagnoli Emanuel", "Vergara Rodrigo"] }
    },
    "Miércoles": {
        "07:00": { titulo: "Entrenamiento personalizado", cupo: 18, alumnos: ["Bissutti Agustin", "Burgos Emma Maria Alejandra", "Garavaglia Patricia", "Iribarren Pablo Ariel", "Novello Virginia"] },
        "08:00": { titulo: "Entrenamiento personalizado", cupo: 15, alumnos: ["Balmaceda Sabrina", "Bardelli Santa Marina", "Casano Martiniano", "Chavez Lucia Magali", "Echeverry Juan Francisco", "Fernandez Alejandro", "Fernandez Catalina", "Fernandez Matias", "Guglielmo Paula", "Guzman Ramiro", "Rodriguez Sebastian", "Vergara Celina"] },
        "09:00": { titulo: "Entrenamiento personalizado", cupo: 15, alumnos: ["Alcantara Paula", "Armendariz Victoria", "Castillo Luana", "Casirro Luana", "Dip Melina", "Espinosa Silvia", "Lujan Juan Cruz", "Mainelli Agustina", "Martinez Ricardo", "Meneguzzo Valoria", "Pimenta Agustin Bruno"] },
        "10:00": { titulo: "Entrenamiento personalizado", cupo: 15, alumnos: ["Bravo Denise", "Cason Santino", "Castillo Pintos Micky", "Cordoba Juliana", "Echeverry Tomas", "Fernandez Tomas", "Gimenez Lola", "Gimenez Santian Juan Ignacio", "Gutierrez Maximo", "Macchiaroli Agustina", "Magaldi Martin", "Medina Franco", "Pereyra Lourdes", "Ugaldenonandia Pilar"] },
        "15:00": { titulo: "Entrenamiento personalizado", cupo: 15, alumnos: ["Alitta Magali", "Arias Pintos Luciana", "Benazzo Giuliana", "Costanza Camila", "Fischer Valentina", "Grasso Santos Lautaro", "Guida Fernando", "Lopez Garcia Marcelo", "Mainelli Lautaro", "Melchiori Malen", "Mille Juan Cruz", "Rolon Lautaro", "Sosa Ignacio", "Vilar Gonzalo"] },
        "16:00": { titulo: "Entrenamiento personalizado", cupo: 15, alumnos: ["Bafico Guadalupe", "Bolla Franco", "Cacciatore Sandra", "Cardozo Luana", "Di Mroca Agustin", "Fernandez Soledad", "Garavaglia Eimila", "Garavaglia Santino", "Juarez Rivero Ignacio", "Lopez Garcia Sebastian", "Martinez Fernando", "Milice Maria Virginia", "Reberte Mariana", "Sandej Nicolas", "Villaluz Ignacio"] },
        "17:00": { titulo: "Entrenamiento personalizado", cupo: 18, alumnos: ["Iribarren Mora", "Arroni Ana Clara", "Antoni Danila", "Bolla Max", "Briosso Gabriela", "Capozzolo Bautista", "Carrizo Edmundo", "Cattaneo Julian", "Del Giodice Maria Aurelia", "Echeverry Horacio", "Fernandez Ramiro", "Gancia Enzo", "Mata Melina", "Perez Natalia", "Pinero Rocio", "Reato Beni", "Sodi Martina", "Vergara Leandro"] },
        "18:00": { titulo: "Entrenamiento personalizado", cupo: 18, alumnos: ["Casco Francisco", "Costa Azul", "Iannuzzio Rocio", "Fernandez Elias", "Flores Blanco", "Gonzalez Miguenz Federico", "Gomez Ely", "Impellizzeri Maria Florencia", "Kopecek Pascual Martin", "Marano Franco", "Maccarone Lucas", "Murillo Lucia", "Pellone Maria Antonieta", "Portillo Diego", "Portillo Juan Cruz", "Piva Dante Agustin", "Santoromi Melina", "Suarez Romero Rafael", "Tombolini Mariano"] },
        "19:00": { titulo: "Entrenamiento personalizado", cupo: 18, alumnos: ["Abasto Tiziano", "Ballester Camila", "Bissutti Tomas", "Carbonero Ceto Josefina", "Dimaro Lautaro", "Drago Morena", "Fernandez Alonso Santiago", "Gancia Thiago", "Garavaglia Camila", "Martin Matias", "Pellegrino Emiliano Carlos", "Romagnoli Franco", "San Jose Franco Nicola", "Santoromi Laureano", "Teveson Lucas", "Zocca Joaquin"] },
        "20:00": { titulo: "Entrenamiento personalizado", cupo: 18, alumnos: ["Briosso Fernanda", "Casella Hernan", "Claros Miguel", "Dias Jimena", "Francia Franco Lautaro", "Gancia Gaston Ezequiel", "Gomez Mercedes", "Longhini Ivan", "Luterio Osvaldo", "Macchi Juli", "Mendez Diaz Julieta", "Ortega Pilar", "Renna Belen", "Revichione Tomas", "Romagnoli Emanuel", "Vergara Rodrigo"] }
    },
    "Jueves": {
        "07:00": { titulo: "Entrenamiento personalizado", cupo: 18, alumnos: ["Bissutti Agustin", "Burgos Emma Maria Alejandra", "De Nosi Laura", "Flecha Mariana", "Garavaglia Patricia", "Iribarren Pablo Ariel", "Novello Virginia", "Valdez Juan Ignacio"] },
        "08:00": { titulo: "Entrenamiento personalizado", cupo: 15, alumnos: ["Almiron Matias", "Arenas Lucas", "Bengolea Juan Ignacio", "Casano Martiniano", "Del Medico Zayat Malia Veronica", "Echeverry Tomas", "Fernandez Dante", "Fernandez Matias", "Mendoz Carolina", "Pellone Maria Antonella", "Rolon Natalia", "Ruiz Alejandra"] },
        "09:00": { titulo: "Entrenamiento personalizado", cupo: 15, alumnos: ["Bareto Brunella", "Bocolini Garmendia Juan", "Capozzolo Duilio", "Conesa Gabriel", "Florio Gracia Celina", "Gando Ricardo", "Guglielmo Paula", "Lujan Juan Cruz", "Saldaña Alejandra"] },
        "10:00": { titulo: "Entrenamiento personalizado", cupo: 15, alumnos: ["Baez Pina Fiorela", "Bravo Denise", "Castillo Pintos Micky", "Gimenez Santian Juan Ignacio", "Gutierrez Mateo Gerardo", "Repetto Rosana", "Rodriguez Valentina Magali", "Scaramilli Nicolas Donato"] },
        "15:00": { titulo: "Entrenamiento personalizado", cupo: 15, alumnos: ["Angeli Juan Martin", "Arias Pintos Luciana", "Banna Carla", "Casirro Malba", "Canton Mora", "Carro Alan", "Espinoza Patricio", "Grasso Maria Agustina", "Guida Fernando", "Marino Maria Virginia", "Pira Delfina", "Pinto Carolina", "Pascal Alejandro", "Sandoz Noemi", "Valdez Juan Ignacio"] },
        "16:00": { titulo: "Entrenamiento personalizado", cupo: 15, alumnos: ["Caceres Santiago", "Cajani Agustina", "Colantino Giuliana", "De Angelis Bruno", "Del Giodice Luca", "Mori Tadeo", "Picot Joaquin", "Rayesolo Silvana", "Reberte Mariana", "Spilam Malba", "Toscano Florencia"] },
        "17:00": { titulo: "Entrenamiento personalizado", cupo: 18, alumnos: ["Batista Roman", "Benitez Tomas", "Crivelli Gonzalo", "Dominguez Brenda Luz Ayelen", "Hornpaka Eduardo", "Impellizzeri Maria Florencia", "Leonelli Jesica Romina", "Lopezcarlo Facundo", "Martinez Luciana", "Mateo Maria", "Misiglo Joel", "Monardez Hugo", "Pellegrini Lucia", "Soto Bautista", "Spanghero Juan Pablo"] },
        "18:00": { titulo: "Entrenamiento personalizado", cupo: 18, alumnos: ["Altamura Candido", "Arama Juan Pablo", "Bidigaray Thiago", "Bounezaim Bautista", "Calvet Tobias", "Cardozo Tomas", "Codina Bianca", "Cristos Santiago", "Cuello Lautaro", "Damico Ingo", "Fernandez Pame Gabriel", "Pin Rodrigo", "Rodriguez Henriquez Marco", "Sabate Faustina", "Teyro Banda", "Trinidad Natalia", "Villagra Miguel"] },
        "19:00": { titulo: "Entrenamiento personalizado", cupo: 18, alumnos: ["Martinez Lautaro Rodrigo", "Caballas Nahuel", "Castro Iñigo", "Hornpaka Pame Joaquin", "Gabella Federico", "Giordano Bocoli Fiama", "Lamas Juan Ignacio", "Plata Felipe", "Reberte Julian Matias", "Semper Lucia", "San Jose Franco Nicola", "Santoromi Lautaro", "Santoromi Marcelo", "Teveson Lucas", "Vivalone Florencia"] },
        "20:00": { titulo: "Entrenamiento personalizado", cupo: 18, alumnos: ["Briosso Fernanda", "Casella Hernan", "Claros Miguel", "Dias Jimena", "Francia Franco Lautaro", "Gancia Gaston Ezequiel", "Gomez Mercedes", "Longhini Ivan", "Macchi Juli", "Mendez Diaz Julieta", "Ortega Pilar", "Renna Belen", "Revichione Tomas", "Romagnoli Emanuel", "Vergara Rodrigo"] }
    },
    "Viernes": {
        "07:00": { titulo: "Entrenamiento personalizado", cupo: 18, alumnos: ["Bissutti Agustin", "Burgos Emma Maria Alejandra", "Flecha Mariana", "Garavaglia Patricia", "Iribarren Pablo Ariel", "Langellotti Ivan", "Novello Virginia", "Valdez Juan Ignacio"] },
        "08:00": { titulo: "Entrenamiento personalizado", cupo: 15, alumnos: ["Arena Lucas", "Bardelli Santa Marina", "Blanco Carla", "Chavez Lucia Magali", "Dip Melina", "Echeverry Juan Francisco", "Fernandez Alejandro", "Fernandez Dante", "Fernandez Sabrina", "Fernandez Matias", "Rodriguez Sebastian"] },
        "09:00": { titulo: "Entrenamiento personalizado", cupo: 15, alumnos: ["Alcantara Paula", "Armendariz Victoria", "Casirro Luana", "Cordoba Juliana", "Echeverry Tomas", "Fernandez Tomas", "Figueroa Sandra", "Garavaglia Sandra", "Gimenez Lola", "Gutierrez Maximo", "Macchiaroli Agustina", "Magaldi Martin", "Medina Franco", "Mendoz Malena"] },
        "10:00": { titulo: "Entrenamiento personalizado", cupo: 15, alumnos: ["Baez Pina Fiorela", "Bravo Denise", "Cordoba Juliana", "Echeverry Tomas", "Fernandez Tomas", "Figueroa Sandra", "Garavaglia Sandra", "Gimenez Lola", "Gutierrez Maximo", "Macchiaroli Agustina", "Magaldi Martin", "Medina Franco", "Mendoz Malena"] },
        "15:00": { titulo: "Entrenamiento personalizado", cupo: 15, alumnos: ["Angeli Juan Martin", "Benazzo Giuliana", "Capozzolo Lourdes", "Catta Maria", "Costanza Camila", "Dimen Ladislao", "Fischer Valentina", "Grasso Santos Lautaro", "Mille Juan Cruz", "Pacheco Malena", "Rolon Estela", "Rolon Lautaro", "Sandej Nicolas", "Vilar Gonzalo"] },
        "16:00": { titulo: "Entrenamiento personalizado", cupo: 15, alumnos: ["Bafico Guadalupe", "Bolla Franco", "Cacciatore Sandra", "Cardozo Luana", "Di Mroca Agustin", "Fernandez Soledad", "Garavaglia Eimila", "Garavaglia Santino", "Juarez Rivero Ignacio", "Lopez Garcia Sebastian", "Martinez Fernando", "Milice Maria Virginia", "Reberte Mariana", "Sandej Nicolas", "Villaluz Ignacio"] },
        "17:00": { titulo: "Entrenamiento personalizado", cupo: 18, alumnos: ["Almiron Benicio", "Antoni Danila", "Bolla Max", "Briosso Gabriela", "Capozzolo Bautista", "Carrizo Edmundo", "Cattaneo Julian", "Dominguez Florencia", "Echeverry Horacio", "Fernandez Ramiro", "Gancia Federico", "Mata Melina", "Perez Natalia", "Pinero Rocio", "Reato Beni", "Sodi Martina", "Vergara Leandro"] },
        "18:00": { titulo: "Entrenamiento personalizado", cupo: 18, alumnos: ["Abasto Tiziano", "Alvarez Juan Pablo", "Casco Karina", "Casco Florencia", "Claros Migue", "Costa Rocio", "Costas Blanca", "Crucill Gonzalo", "Glavic Rocio", "Maccarone Lucas", "Portillo Diego", "Portillo Juan Cruz", "Piva Dante Agustin", "Pellea Agustin", "Suarez Romero Rafael", "Tombolini Mariano"] },
        "19:00": { titulo: "Entrenamiento personalizado", cupo: 18, alumnos: ["Bidigaray Tomas", "Boli Iñaki", "Bounezaim Bautista", "Calvet Tobias", "Martin Matias", "Miranda Tomas", "Natale Franco", "Navas Carolina", "Ortiz Rocio", "Pellegrino Emiliano Carlos", "Perez Pujol Lucia", "Rolon Natalia", "Scaglioni Camila", "Velazquez Lara", "Zocca Joaquin"] },
        "20:00": { titulo: "Entrenamiento personalizado", cupo: 18, alumnos: ["Briosso Fernanda", "Casella Hernan", "Claros Miguel", "Dias Jimena", "Francia Franco Lautaro", "Gancia Gaston Ezequiel", "Gomez Mercedes", "Longhini Ivan", "Macchi Juli", "Mendez Diaz Julieta", "Ortega Pilar", "Renna Belen", "Revichione Tomas", "Romagnoli Emanuel", "Vergara Rodrigo"] }
    },
    "Sábado": {
        "09:00": { titulo: "Entrenamiento personalizado", cupo: 10, alumnos: ["Bissutti Carla", "Espinoza Silvia", "Fernandez Nilda", "Gallegos Lucila"] },
        "10:00": { titulo: "Entrenamiento personalizado", cupo: 10, alumnos: ["Bolla Sofia", "Di Napoli Roxana", "Dominguez Brenda Luz Ayelen"] },
        "11:00": { titulo: "Entrenamiento personalizado", cupo: 10, alumnos: ["Griber Mariam Melania Narela", "Garaglia Facundo", "Reato Beni", "Tombolini Malena"] }
    }
};

// ============================================================================
// LÓGICA DEL AUDITOR (NO MODIFICA NADA EN LA BD)
// ============================================================================

async function auditarAlumnos() {
    let connection;
    try {
        console.log("🔍 Iniciando Auditoría de Alumnos STORM...");
        connection = await mysql.createConnection(dbConfig);

        const [usuarios] = await connection.execute("SELECT id, nombre, apellido FROM usuarios");
        
        const usuariosBD = usuarios.map(u => ({
            id: u.id,
            texto: normalizar(`${u.apellido} ${u.nombre}`)
        }));

        // Extraer todos los nombres únicos de la grilla
        const todosLosNombresGrilla = new Set();
        
        for (const dia in grillaFija) {
            for (const hora in grillaFija[dia]) {
                const alumnos = grillaFija[dia][hora].alumnos;
                alumnos.forEach(a => todosLosNombresGrilla.add(a));
            }
        }

        const faltantes = [];
        const encontrados = [];

        // Cruzar datos
        todosLosNombresGrilla.forEach(nombreAlumno => {
            const nombreBuscado = normalizar(nombreAlumno);
            const palabrasBuscadas = nombreBuscado.split(' ');

            const alumnoEncontrado = usuariosBD.find(u => 
                palabrasBuscadas.every(palabra => u.texto.includes(palabra))
            );

            if (alumnoEncontrado) {
                encontrados.push(nombreAlumno);
            } else {
                faltantes.push(nombreAlumno);
            }
        });

        // Mostrar Reporte
        console.log("\n==================================================");
        console.log("📊 REPORTE DE AUDITORÍA");
        console.log("==================================================");
        console.log(`✅ Alumnos encontrados y perfectos: ${encontrados.length}`);
        console.log(`❌ Alumnos faltantes o mal escritos: ${faltantes.length}`);
        
        if (faltantes.length > 0) {
            console.log("\n⚠️ LISTA DE FALTANTES A REVISAR (Ordenados alfabéticamente):");
            faltantes.sort().forEach(f => console.log(`   - ${f}`));
        }
        console.log("==================================================\n");

    } catch (error) {
        console.error("Error en la auditoría:", error);
    } finally {
        if (connection) await connection.end();
        process.exit();
    }
}

auditarAlumnos();