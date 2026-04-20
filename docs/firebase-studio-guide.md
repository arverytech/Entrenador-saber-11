# Guía de Configuración en Firebase Studio

Esta guía explica, paso a paso, qué debes configurar en **Firebase Studio** para que todas las funcionalidades de la plataforma Entrenador Saber 11 funcionen correctamente.

---

## ¿Qué es Firebase Studio?

Firebase Studio es el entorno de desarrollo integrado (IDE) en la nube que usa este proyecto. Desde allí puedes gestionar la base de datos (Firestore), la autenticación de usuarios, las variables de entorno y el despliegue de la aplicación.

---

## 1. Variables de Entorno Necesarias

Estas variables deben configurarse en el archivo `.env` del proyecto (o en los "Secrets" de Firebase App Hosting). Sin ellas, las funciones de IA no funcionarán.

| Variable | Para qué sirve | Dónde obtenerla |
|---|---|---|
| `GOOGLE_GENAI_API_KEY` o `GEMINI_API_KEY` | Permite que la IA genere preguntas y misiones adaptativas | [Google AI Studio](https://aistudio.google.com/app/apikey) → "Get API key" |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Conecta la app a tu proyecto Firebase | Firebase Console → Configuración del proyecto → Tus apps → Web |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Dominio para la autenticación de Firebase | Mismo lugar que el anterior |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Identificador de tu proyecto Firebase | Mismo lugar que el anterior |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Almacenamiento de archivos | Mismo lugar que el anterior |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | ID único de tu app web en Firebase | Mismo lugar que el anterior |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Para notificaciones push (futuro uso) | Mismo lugar que el anterior |

> **Cómo agregar variables en Firebase Studio:** Abre el archivo `.env` en el explorador de archivos del IDE y agrega cada línea con el formato `NOMBRE_VARIABLE=valor`.

---

## 2. Configuración de Firebase Authentication

Debes habilitar los métodos de inicio de sesión en la consola de Firebase.

| Paso | Dónde hacerlo | Qué hacer |
|---|---|---|
| 1. Ir a Authentication | Firebase Console → tu proyecto → Authentication → Sign-in method | Clic en "Sign-in method" |
| 2. Habilitar Email/Contraseña | En la lista de proveedores | Activar "Email/password" |
| 3. Habilitar Google | En la lista de proveedores | Activar "Google" y agregar correo de soporte |
| 4. Agregar dominio autorizado | Pestaña "Authorized domains" | Agregar el dominio de tu app (ej: `entrenador-saber-11.vercel.app` o el URL de Firebase App Hosting) |

---

## 3. Configuración de Firestore Database

La base de datos guarda usuarios, preguntas, intentos y llaves de acceso.

### 3.1 Crear la Base de Datos

| Paso | Dónde | Qué hacer |
|---|---|---|
| 1 | Firebase Console → Firestore Database | Clic en "Create database" |
| 2 | Elegir modo | Seleccionar "Start in production mode" |
| 3 | Elegir región | `us-central1` (recomendado) |

### 3.2 Reglas de Seguridad

Las reglas de seguridad ya están configuradas en el archivo `firestore.rules` del proyecto. Para aplicarlas:

| Paso | Acción |
|---|---|
| 1. Abrir Firestore en Firebase Console | Firebase Console → Firestore Database → Rules |
| 2. Copiar el contenido | Copia todo el contenido del archivo `firestore.rules` del proyecto |
| 3. Pegar y publicar | Pega en el editor de reglas y haz clic en "Publish" |

### 3.3 Colecciones Necesarias

Debes crear manualmente algunos documentos iniciales. Para agregar documentos: Firestore → tu base de datos → "Start collection".

| Colección | Cuándo crearla | Estructura del documento |
|---|---|---|
| `users` | Se crea automáticamente cuando el primer usuario inicia sesión | Se genera solo |
| `questions` | Para tener preguntas en el banco (sin IA) | Ver sección 3.4 |
| `premiumAccessKeys` | Para que los usuarios puedan activar su acceso | Ver sección 3.5 |
| `adminUsers` | Se crea automáticamente cuando un administrador usa la llave | Se genera solo |

### 3.4 Estructura de una Pregunta (`questions`)

Para agregar una pregunta al banco, crea un documento en la colección `questions` con estos campos:

| Campo | Tipo | Ejemplo |
|---|---|---|
| `subjectId` | text (string) | `matematicas` |
| `text` | text (string) | `¿Cuánto es 2 + 2?` |
| `options` | array | `["3", "4", "5", "6"]` |
| `correctAnswerIndex` | number | `1` (índice 0=A, 1=B, 2=C, 3=D) |
| `componentId` | text (string) | `Álgebra` |
| `competencyId` | text (string) | `Resolución de problemas` |

Los valores válidos para `subjectId` son: `matematicas`, `lectura`, `naturales`, `sociales`, `ingles`, `socioemocional`.

### 3.5 Estructura de una Llave de Acceso (`premiumAccessKeys`)

Para crear una llave que los estudiantes puedan canjear, agrega un documento en `premiumAccessKeys`:

| Campo | Tipo | Ejemplo | Descripción |
|---|---|---|---|
| `keyString` | text (string) | `HERO-2025-ABC` | El código que le das al estudiante |
| `isActive` | boolean | `true` | Si está disponible para usar |
| `type` | text (string) | `student_access` | Usa `student_access` para estudiantes o `admin_access` para administradores |

> **Nota importante:** El código `ADMIN-MASTER-2025` está pre-configurado como llave maestra de administrador y no requiere documento en Firestore.

---

## 4. Resumen de Problemas y Sus Soluciones

| Problema reportado | Causa raíz | Solución |
|---|---|---|
| Misiones con IA no funcionan | Falta la variable `GOOGLE_GENAI_API_KEY` o `GEMINI_API_KEY` | Agregar el API key de Google AI Studio al archivo `.env` |
| "Finalizar Misión" no funciona | Error en el cierre de sesión sin manejo de errores | **Ya corregido en el código** — ahora navega a login aunque falle |
| "Salir" no funciona | Mismo problema que el anterior | **Ya corregido en el código** — mismo fix aplicado |
| Llave de acceso no funciona | La consulta a Firestore requería un índice compuesto no creado | **Ya corregido en el código** — la consulta fue simplificada para no necesitar índice |

---

## 5. Flujo Completo para Activar la Plataforma

Sigue estos pasos en orden para dejar todo funcionando:

| # | Paso | Dónde |
|---|---|---|
| 1 | Crear proyecto en Firebase | [Firebase Console](https://console.firebase.google.com) → "Add project" |
| 2 | Habilitar Authentication (Email + Google) | Firebase Console → Authentication |
| 3 | Crear base de datos Firestore | Firebase Console → Firestore Database |
| 4 | Publicar reglas de seguridad | Copiar `firestore.rules` → Firestore → Rules → Publish |
| 5 | Agregar variables de entorno | Archivo `.env` en Firebase Studio |
| 6 | Obtener API key de Google AI | [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| 7 | Crear primeras llaves de acceso premium | Firestore → colección `premiumAccessKeys` |
| 8 | Agregar preguntas al banco | Firestore → colección `questions` |
| 9 | Desplegar la aplicación | Firebase Studio → botón "Deploy" o panel de App Hosting |

---

## 6. Verificación Final

Después de configurar todo, verifica que funciona:

| Prueba | Resultado esperado |
|---|---|
| Iniciar sesión con Google | Redirige al dashboard con nombre de usuario |
| Clic en "Generar Misión Personalizada" | Aparece una misión generada por IA (puede tardar 5-10 segundos) |
| Ingresar una llave válida en "Validar Acceso" | Aparece el mensaje "¡Acceso Activado!" |
| Clic en "Finalizar Misión" (menú de avatar) | Cierra sesión y redirige a la página de login |
| Clic en "Salir" (página de perfil) | Cierra sesión y redirige a la página de login |
