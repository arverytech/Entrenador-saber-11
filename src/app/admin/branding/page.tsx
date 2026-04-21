
"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { GameNavbar } from '@/components/game-navbar';
import { useBranding } from '@/components/branding-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Settings, Save, Database, Loader2, BookOpen, Ticket, Trash2, Link2, CheckCircle2, UploadCloud, AlignLeft, Sparkles } from 'lucide-react';
import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { collection, addDoc, deleteDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';

/** Discriminated union of all SSE events emitted by /api/import-questions-stream. */
type SSEImportEvent =
  | { type: 'start'; totalChunks: number; totalChars: number }
  | {
      type: 'chunk';
      chunkIndex: number;
      totalChunks: number;
      questions: Record<string, unknown>[];
      questionsInChunk: number;
      totalQuestionsSoFar: number;
    }
  | { type: 'chunkError'; chunkIndex: number; totalChunks: number; message: string }
  | { type: 'done'; totalQuestions: number; sourceNote: string }
  | { type: 'error'; message: string };

export default function AdminBrandingPage() {
  const { institutionName, institutionLogo, updateBranding } = useBranding();
  const [name, setName] = useState(institutionName);
  const [logo, setLogo] = useState(institutionLogo);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isGeneratingKeys, setIsGeneratingKeys] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importText, setImportText] = useState('');
  const [generateExplanations, setGenerateExplanations] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ count: number; note: string } | null>(null);
  const [importProgress, setImportProgress] = useState<{
    chunksProcessed: number;
    totalChunks: number;
    questionsFound: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { firestore, user, isUserLoading } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/auth/login');
    }
  }, [user, isUserLoading, router]);

  const keysQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'premiumAccessKeys'), orderBy('createdAt', 'desc'));
  }, [firestore]);

  const { data: existingKeys } = useCollection(keysQuery);

  const handleSave = () => {
    updateBranding(name, logo);
    toast({ title: "Protocolo Guardado", description: "La identidad institucional ha sido sincronizada." });
  };

  const generateNewKey = async (type: 'premium_subscription' | 'admin_access') => {
    if (!firestore) return;
    setIsGeneratingKeys(true);
    try {
      const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
      const prefix = type === 'admin_access' ? 'ADM' : 'ICFES';
      const keyString = `${prefix}-${randomPart}-${Date.now().toString().slice(-4)}`;

      await addDoc(collection(firestore, 'premiumAccessKeys'), {
        keyString,
        type,
        durationDays: 365,
        isActive: true,
        createdAt: serverTimestamp(),
        redeemedByUserId: null,
        redeemedAt: null
      });

      toast({ title: "Llave Generada", description: `Nueva licencia ${type} lista para usar.` });
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo generar la llave." });
    } finally {
      setIsGeneratingKeys(false);
    }
  };

  const deleteKey = async (id: string) => {
    if (!firestore) return;
    try {
      await deleteDoc(doc(firestore, 'premiumAccessKeys', id));
      toast({ title: "Llave Eliminada", description: "El código ha sido revocado." });
    } catch (e) {
      toast({ variant: "destructive", title: "Acceso Denegado", description: "No tienes permisos para eliminar llaves." });
    }
  };

  const handleImport = async (mode: 'url' | 'file' | 'text') => {
    if (!firestore) return;
    if (mode === 'url' && !importUrl.trim()) return;
    if (mode === 'file' && !importFile) return;
    if (mode === 'text' && !importText.trim()) return;

    setIsImporting(true);
    setImportResult(null);
    setImportProgress(null);

    const abort = new AbortController();
    abortControllerRef.current = abort;

    try {
      let res: Response;

      if (mode === 'url') {
        res = await fetch('/api/import-questions-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: importUrl.trim(), generateExplanations }),
          signal: abort.signal,
        });
      } else {
        const formData = new FormData();
        if (mode === 'file' && importFile) {
          formData.append('file', importFile);
        } else {
          formData.append('text', importText.trim());
        }
        formData.append('generateExplanations', String(generateExplanations));
        res = await fetch('/api/import-questions-stream', {
          method: 'POST',
          body: formData,
          signal: abort.signal,
        });
      }

      if (!res.body) throw new Error('La respuesta del servidor no contiene datos.');

      // For non-2xx before stream starts, read the SSE error event
      if (!res.ok) {
        const text = await res.text();
        const dataLine = text.split('\n').find((l) => l.startsWith('data: '));
        if (dataLine) {
          try {
            const evt = JSON.parse(dataLine.slice(6));
            throw new Error(evt.message || `Error del servidor: ${res.status}`);
          } catch (inner) {
            if (inner instanceof SyntaxError) throw new Error(`Error del servidor: ${res.status}`);
            throw inner;
          }
        }
        throw new Error(`Error del servidor: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let totalSaved = 0;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by double newlines
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() ?? '';

        for (const block of blocks) {
          const dataLine = block.split('\n').find((l) => l.startsWith('data: '));
          if (!dataLine) continue;

          let event: SSEImportEvent;
          try {
            event = JSON.parse(dataLine.slice(6)) as SSEImportEvent;
          } catch {
            continue;
          }

          switch (event.type) {
            case 'start':
              setImportProgress({ chunksProcessed: 0, totalChunks: event.totalChunks, questionsFound: 0 });
              break;

            case 'chunk': {
              const timestamp = new Date().toISOString();
              await Promise.all(
                event.questions.map((q) =>
                  addDoc(collection(firestore, 'questions'), {
                    ...q,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                  })
                )
              );
              totalSaved += event.questionsInChunk;
              setImportProgress({
                chunksProcessed: event.chunkIndex,
                totalChunks: event.totalChunks,
                questionsFound: totalSaved,
              });
              break;
            }

            case 'chunkError':
              setImportProgress((prev) =>
                prev ? { ...prev, chunksProcessed: event.chunkIndex } : null
              );
              break;

            case 'done':
              setImportResult({ count: totalSaved, note: event.sourceNote });
              toast({
                title: 'Importación Exitosa',
                description: `${totalSaved} pregunta(s) guardada(s) en la base de datos.`,
              });
              if (mode === 'url') setImportUrl('');
              if (mode === 'file') {
                setImportFile(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }
              if (mode === 'text') setImportText('');
              break;

            case 'error':
              throw new Error(event.message);
          }
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') {
        toast({ title: 'Importación Cancelada', description: 'El proceso fue detenido.' });
      } else {
        const msg = e instanceof Error ? e.message : 'No se pudo importar el contenido.';
        toast({
          variant: 'destructive',
          title: 'Error de Importación',
          description: msg,
        });
      }
    } finally {
      setIsImporting(false);
      setImportProgress(null);
      abortControllerRef.current = null;
    }
  };

  const cancelImport = () => {
    abortControllerRef.current?.abort();
  };

  const seedQuestions = async () => {
    if (!firestore) return;
    setIsSeeding(true);
    try {
      const sampleQuestions = [
        {
          id: `q_mat_${Date.now()}`,
          text: "¿Cuál es el valor de x en la ecuación 2x + 5 = 15?",
          options: ["x = 5", "x = 10", "x = 20", "x = 7.5"],
          correctAnswerIndex: 0,
          explanation: "2x = 15 - 5 => 2x = 10 => x = 5.",
          subjectId: "matematicas",
          componentId: "Numérico-Variacional",
          competencyId: "Formulación y ejecución",
          level: "Básico",
          pointsAwarded: 50,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: `q_lect_${Date.now()}`,
          text: "En un texto argumentativo, la tesis principal es:",
          options: ["Un resumen del libro", "La opinión que el autor busca defender", "Un listado de personajes", "La bibliografía utilizada"],
          correctAnswerIndex: 1,
          explanation: "La tesis es la idea central u opinión que se sustenta con argumentos.",
          subjectId: "lectura",
          componentId: "Semántico",
          competencyId: "Interpretativa",
          level: "Básico",
          pointsAwarded: 50,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];

      for (const q of sampleQuestions) {
        await addDoc(collection(firestore, 'questions'), q);
      }

      toast({ title: "Sincronización Exitosa", description: "Preguntas inyectadas en la base de datos." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Fallo de Carga", description: "Error al inyectar datos." });
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <GameNavbar />
      <main className="max-w-7xl mx-auto p-6 space-y-8">
        <header className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-primary/10 p-3 rounded-2xl border-2 border-primary/20">
              <Settings className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-black uppercase italic tracking-tighter">Panel de Comando</h1>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest italic">Gestión de Identidad y Licencias</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={seedQuestions} disabled={isSeeding} className="border-accent text-accent font-black h-12 hover:bg-accent/5">
              {isSeeding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Database className="w-4 h-4 mr-2" />}
              CARGAR PREGUNTAS OFICIALES
            </Button>
            <Button className="game-button bg-primary text-white h-12 px-8" onClick={handleSave}>
              <Save className="w-4 h-4 mr-2" /> GUARDAR IDENTIDAD
            </Button>
          </div>
        </header>

        <div className="grid lg:grid-cols-2 gap-8">
          <Card className="game-card border-primary/20 bg-card shadow-xl">
            <CardHeader>
              <CardTitle className="text-xl font-bold uppercase flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" /> Identidad Visual
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-muted-foreground">Nombre de la Academia</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="h-12 border-2" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-muted-foreground">URL del Logo (PNG)</Label>
                <Input value={logo} onChange={(e) => setLogo(e.target.value)} className="h-12 border-2" />
              </div>
            </CardContent>
          </Card>

          <Card className="game-card border-accent/20 bg-card shadow-xl">
             <CardHeader className="flex flex-row items-center justify-between">
               <CardTitle className="text-xl font-bold uppercase flex items-center gap-2 text-accent">
                 <Ticket className="w-5 h-5" /> Generador de Licencias
               </CardTitle>
               <div className="flex gap-2">
                  <Button size="sm" onClick={() => generateNewKey('premium_subscription')} disabled={isGeneratingKeys} className="bg-secondary text-white font-bold h-8">
                    + PREMIUM
                  </Button>
                  <Button size="sm" onClick={() => generateNewKey('admin_access')} disabled={isGeneratingKeys} className="bg-primary text-white font-bold h-8">
                    + ADMIN
                  </Button>
               </div>
             </CardHeader>
             <CardContent className="space-y-4 max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[9px] font-black uppercase">Llave</TableHead>
                      <TableHead className="text-[9px] font-black uppercase">Tipo</TableHead>
                      <TableHead className="text-[9px] font-black uppercase">Estado</TableHead>
                      <TableHead className="text-[9px] font-black uppercase text-right">Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {existingKeys?.map((k) => (
                      <TableRow key={k.id}>
                        <TableCell className="font-mono text-xs font-bold">{k.keyString}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[8px] font-black">
                            {k.type === 'admin_access' ? 'ADMIN' : 'PREMIUM'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-[8px] font-black ${k.isActive ? 'bg-secondary' : 'bg-muted text-muted-foreground'}`}>
                            {k.isActive ? 'ACTIVA' : 'USADA'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => deleteKey(k.id)} className="h-8 w-8 text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!existingKeys || existingKeys.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-xs italic">
                          No hay llaves generadas. Crea una para empezar.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
             </CardContent>
          </Card>
        </div>

        {/* ── Importar preguntas ──────────────────────────────────────────── */}
        <Card className="game-card border-secondary/20 bg-card shadow-xl">
          <CardHeader>
            <CardTitle className="text-xl font-bold uppercase flex items-center gap-2 text-secondary">
              <UploadCloud className="w-5 h-5" /> Importar Preguntas
            </CardTitle>
            <CardDescription className="text-[10px] font-bold uppercase tracking-widest">
              Elige un método: URL pública, archivo de texto (.txt / .csv) o pega el contenido directamente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Tabs defaultValue="url">
              <TabsList className="grid w-full grid-cols-3 bg-muted h-12">
                <TabsTrigger value="url" className="text-[10px] font-black uppercase data-[state=active]:bg-secondary data-[state=active]:text-white flex items-center gap-1">
                  <Link2 className="w-3 h-3" /> URL
                </TabsTrigger>
                <TabsTrigger value="file" className="text-[10px] font-black uppercase data-[state=active]:bg-secondary data-[state=active]:text-white flex items-center gap-1">
                  <UploadCloud className="w-3 h-3" /> Archivo
                </TabsTrigger>
                <TabsTrigger value="text" className="text-[10px] font-black uppercase data-[state=active]:bg-secondary data-[state=active]:text-white flex items-center gap-1">
                  <AlignLeft className="w-3 h-3" /> Texto
                </TabsTrigger>
              </TabsList>

              {/* URL tab */}
              <TabsContent value="url" className="mt-4 space-y-3">
                <div className="flex flex-col md:flex-row gap-3">
                  <Input
                    placeholder="https://ejemplo.com/guia-matematicas"
                    value={importUrl}
                    onChange={(e) => { setImportUrl(e.target.value); setImportResult(null); }}
                    className="h-12 border-2 flex-1 font-mono text-sm"
                    disabled={isImporting}
                  />
                  <Button
                    className="game-button bg-secondary text-white h-12 px-8 shadow-lg whitespace-nowrap"
                    onClick={() => handleImport('url')}
                    disabled={isImporting || !importUrl.trim()}
                  >
                    {isImporting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Link2 className="w-4 h-4 mr-2" />}
                    {isImporting ? 'Procesando con IA...' : 'Importar desde URL'}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground italic">
                  La URL debe ser accesible públicamente. El contenido se procesa en fragmentos de 10 000 caracteres sin límite de tamaño total, con progreso en tiempo real.
                </p>
              </TabsContent>

              {/* File upload tab */}
              <TabsContent value="file" className="mt-4 space-y-3">
                <div className="flex flex-col md:flex-row gap-3 items-start">
                  <div className="flex-1 space-y-2">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground">
                      Archivo de texto (.txt, .csv o .md)
                    </Label>
                    <Input
                      ref={fileInputRef}
                      type="file"
                      accept=".txt,.csv,.md"
                      onChange={(e) => { setImportFile(e.target.files?.[0] ?? null); setImportResult(null); }}
                      className="h-12 border-2 cursor-pointer"
                      disabled={isImporting}
                    />
                    {importFile && (
                      <p className="text-[10px] text-secondary font-bold">
                        Seleccionado: {importFile.name} ({(importFile.size / 1024).toFixed(1)} KB)
                      </p>
                    )}
                  </div>
                  <Button
                    className="game-button bg-secondary text-white h-12 px-8 shadow-lg whitespace-nowrap mt-6"
                    onClick={() => handleImport('file')}
                    disabled={isImporting || !importFile}
                  >
                    {isImporting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UploadCloud className="w-4 h-4 mr-2" />}
                    {isImporting ? 'Procesando con IA...' : 'Importar Archivo'}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground italic">
                  Sube un archivo de texto plano con el contenido académico. El sistema lo fragmentará y extraerá todas las preguntas posibles.
                </p>
              </TabsContent>

              {/* Paste text tab */}
              <TabsContent value="text" className="mt-4 space-y-3">
                <Textarea
                  placeholder="Pega aquí el contenido del documento, guía de estudio o banco de preguntas..."
                  value={importText}
                  onChange={(e) => { setImportText(e.target.value); setImportResult(null); }}
                  className="border-2 min-h-[180px] font-mono text-sm resize-y"
                  disabled={isImporting}
                />
                <div className="flex justify-end">
                  <Button
                    className="game-button bg-secondary text-white h-12 px-8 shadow-lg"
                    onClick={() => handleImport('text')}
                    disabled={isImporting || !importText.trim()}
                  >
                    {isImporting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <AlignLeft className="w-4 h-4 mr-2" />}
                    {isImporting ? 'Procesando con IA...' : 'Importar Texto'}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground italic">
                  Ideal para pegar directamente el contenido de Google Docs u otras fuentes. Sin límite de tamaño; el progreso se muestra en tiempo real mientras se procesan los fragmentos.
                </p>
              </TabsContent>
            </Tabs>

            {/* Live progress bar (only visible while streaming) */}
            {isImporting && importProgress && (
              <div className="p-4 bg-muted/50 rounded-2xl border border-secondary/20 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-secondary">
                    Fragmento {importProgress.chunksProcessed} de {importProgress.totalChunks}...
                  </span>
                  <span className="text-xs font-black text-secondary">
                    {importProgress.questionsFound} pregunta(s) guardada(s)
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-secondary h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.round(
                        (importProgress.chunksProcessed / Math.max(1, importProgress.totalChunks)) * 100
                      )}%`,
                    }}
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={cancelImport}
                    className="text-xs text-destructive border-destructive/50 hover:bg-destructive/5 h-7"
                  >
                    Cancelar importación
                  </Button>
                </div>
              </div>
            )}

            {/* Pre-generate explanations option */}
            <div className="flex items-start gap-3 p-4 bg-primary/5 rounded-2xl border border-primary/20">
              <input
                type="checkbox"
                id="generateExplanations"
                checked={generateExplanations}
                onChange={(e) => setGenerateExplanations(e.target.checked)}
                className="mt-1 w-4 h-4 accent-primary cursor-pointer"
                disabled={isImporting}
              />
              <div>
                <label htmlFor="generateExplanations" className="text-xs font-black uppercase text-primary cursor-pointer">
                  <Sparkles className="w-3 h-3 inline mr-1" />
                  Pre-generar Explicaciones Maestro IA
                </label>
                <p className="text-[10px] text-muted-foreground mt-1 italic">
                  Genera automáticamente las explicaciones de 3 fases para cada pregunta al importar. Los estudiantes las verán al instante sin esperar. <strong>Nota: aumenta el tiempo de importación.</strong>
                </p>
              </div>
            </div>

            {importResult && (
              <div className="flex items-start gap-3 p-4 bg-secondary/5 rounded-2xl border border-secondary/20 text-sm">
                <CheckCircle2 className="w-5 h-5 text-secondary shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-secondary">{importResult.count} pregunta(s) guardada(s) correctamente.</p>
                  <p className="text-xs text-muted-foreground italic mt-1">{importResult.note}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
