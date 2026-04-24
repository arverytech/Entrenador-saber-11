
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
import { Settings, Save, Database, Loader2, BookOpen, Ticket, Trash2, Link2, CheckCircle2, UploadCloud, AlignLeft, AlertTriangle, XCircle } from 'lucide-react';
import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { collection, addDoc, deleteDoc, doc, updateDoc, query, orderBy, serverTimestamp, getDocs, where } from 'firebase/firestore';
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

/** A question that has been saved to Firestore, carrying the fields needed for explanation generation. */
interface SavedQuestion {
  firestoreId: string;
  text: string;
  options: string[];
  correctAnswerIndex: number;
  subjectId: string;
  componentId?: string;
  competencyId?: string;
}

type ChecklistItemStatus = 'idle' | 'pending' | 'done' | 'error';

interface ImportChecklist {
  step1: { status: ChecklistItemStatus; detail?: string; error?: string };
  step2: { status: ChecklistItemStatus; detail?: string; error?: string };
  step3: { status: ChecklistItemStatus; detail?: string; error?: string };
  /** 'queue' = async GitHub Actions path; 'stream' = SSE path */
  mode: 'queue' | 'stream';
  sessionId?: string;
  totalChunks?: number;
  chunksProcessed?: number;
  totalQuestions?: number;
}

/** Maximum duration in milliseconds for queue polling before automatically stopping. */
const QUEUE_POLL_MAX_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours

export default function AdminBrandingPage() {
  const { institutionName, institutionLogo, updateBranding } = useBranding();
  const [name, setName] = useState(institutionName);
  const [logo, setLogo] = useState(institutionLogo);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isGeneratingKeys, setIsGeneratingKeys] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importText, setImportText] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ count: number; note: string } | null>(null);
  const [importChecklist, setImportChecklist] = useState<ImportChecklist | null>(null);
  const [uploadPhase, setUploadPhase] = useState<{
    message: string;
    progress: number | null;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const queuePollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { firestore, user, isUserLoading } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/auth/login');
    }
  }, [user, isUserLoading, router]);

  // ── Queue polling — checks Firestore importJobs every 5 s when a queue session is active ──
  useEffect(() => {
    const sessionId = importChecklist?.mode === 'queue' ? importChecklist.sessionId : null;
    if (!sessionId || !firestore) return;

    // Don't poll if step2 is already done or errored
    if (importChecklist?.step2.status === 'done' || importChecklist?.step2.status === 'error') {
      return;
    }

    // Stop polling after 2 hours to avoid excessive Firestore reads
    const pollStopTime = Date.now() + QUEUE_POLL_MAX_DURATION_MS;

    const poll = async () => {
      if (Date.now() > pollStopTime) {
        if (queuePollingRef.current) clearInterval(queuePollingRef.current);
        // Notify the user that automatic polling has stopped
        setImportChecklist((prev) =>
          prev
            ? {
                ...prev,
                step2: {
                  ...prev.step2,
                  detail:
                    (prev.step2.detail ?? '') +
                    ' (monitoreo automático detenido — recarga la página para verificar el estado final)',
                },
              }
            : prev
        );
        return;
      }
      try {
        const snap = await getDocs(
          query(collection(firestore, 'importJobs'), where('sessionId', '==', sessionId))
        );
        if (snap.empty) return;

        const jobs = snap.docs.map((d) => d.data() as {
          status: string;
          questionsFound: number;
          chunkIndex: number;
          totalChunks: number;
          errorMessage?: string;
        });

        const total = jobs[0]?.totalChunks ?? jobs.length;
        const doneCount = jobs.filter((j) => j.status === 'done').length;
        const failedCount = jobs.filter((j) => j.status === 'failed').length;
        const totalQuestions = jobs.reduce((s, j) => s + (j.questionsFound ?? 0), 0);
        const failedMessages = jobs
          .filter((j) => j.status === 'failed' && j.errorMessage)
          .map((j) => `Fragmento ${j.chunkIndex}: ${j.errorMessage}`);

        setImportChecklist((prev) => {
          if (!prev) return prev;
          const allDone = doneCount + failedCount >= total;
          const hasErrors = failedCount > 0;

          let step2: ImportChecklist['step2'];
          if (allDone && !hasErrors) {
            step2 = { status: 'done', detail: `${totalQuestions} pregunta(s) extraídas de ${total} fragmento(s)` };
          } else if (allDone && hasErrors && doneCount === 0) {
            step2 = { status: 'error', error: failedMessages.join(' | ') };
          } else if (hasErrors) {
            step2 = {
              status: doneCount + failedCount >= total ? 'error' : 'pending',
              detail: `${doneCount}/${total} fragmentos procesados`,
              error: `${failedCount} fragmento(s) fallaron: ${failedMessages.join(' | ')}. Se reintentarán automáticamente.`,
            };
          } else {
            step2 = { status: 'pending', detail: `${doneCount}/${total} fragmentos procesados` };
          }

          const newChecklist: ImportChecklist = {
            ...prev,
            step2,
            totalChunks: total,
            chunksProcessed: doneCount + failedCount,
            totalQuestions,
          };

          // When step2 is done, kick off step3 check
          if (step2.status === 'done') {
            newChecklist.step3 = { status: 'pending', detail: 'Verificando explicaciones IA...' };
          }

          return newChecklist;
        });

        // After all done, check explanations
        if (doneCount + failedCount >= total && doneCount > 0) {
          try {
            const qSnap = await getDocs(
              query(collection(firestore, 'questions'), where('importSessionId', '==', sessionId))
            );
            const allQs = qSnap.docs.map((d) => d.data());
            const withExplanation = allQs.filter((q) => q.aiExplanation != null).length;
            const total3 = allQs.length;
            if (total3 > 0 && withExplanation >= total3) {
              setImportChecklist((prev) =>
                prev ? { ...prev, step3: { status: 'done', detail: `${total3} explicaciones generadas` } } : prev
              );
            } else if (total3 > 0) {
              setImportChecklist((prev) =>
                prev
                  ? {
                      ...prev,
                      step3: {
                        status: 'pending',
                        detail: `${withExplanation}/${total3} — se generarán automáticamente cada 2 h`,
                      },
                    }
                  : prev
              );
            }
          } catch {
            // Non-fatal
          }
        }
      } catch (err) {
        console.warn('[queue-poll] error:', err);
      }
    };

    queuePollingRef.current = setInterval(poll, 5_000);
    void poll();

    return () => {
      if (queuePollingRef.current) clearInterval(queuePollingRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // Intentionally only depend on sessionId and mode to avoid re-registering
    // the interval every time checklist status fields update.
  }, [importChecklist?.sessionId, importChecklist?.mode, firestore]);

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
    setImportChecklist(null);
    setUploadPhase(null);
    if (queuePollingRef.current) clearInterval(queuePollingRef.current);

    const abort = new AbortController();
    abortControllerRef.current = abort;

    // ── Determine if we should use the queue or the stream ────────────────
    const isPdfFile =
      mode === 'file' &&
      importFile != null &&
      (importFile.name.toLowerCase().endsWith('.pdf') ||
        importFile.type === 'application/pdf' ||
        importFile.type === 'application/x-pdf');

    const isPdfUrl =
      mode === 'url' &&
      (importUrl.trim().toLowerCase().endsWith('.pdf') ||
        importUrl.trim().toLowerCase().includes('.pdf?'));

    const useQueue = isPdfFile || isPdfUrl;

    // ── Queue path: file is PDF or URL points to a PDF ────────────────────
    if (useQueue) {
      try {
        let queueRes: Response;

        if (isPdfFile && importFile) {
          const sizeMb = (importFile.size / (1024 * 1024)).toFixed(1);
          setUploadPhase({
            message: `Enviando PDF (${sizeMb} MB) al servidor para fragmentar...`,
            progress: null,
          });
          const fd = new FormData();
          fd.append('file', importFile);
          queueRes = await fetch('/api/import-queue', {
            method: 'POST',
            body: fd,
            signal: abort.signal,
          });
        } else {
          setUploadPhase({ message: 'Descargando PDF desde URL...', progress: null });
          queueRes = await fetch('/api/import-queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: importUrl.trim() }),
            signal: abort.signal,
          });
        }

        setUploadPhase(null);

        if (!queueRes.ok) {
          const errData = await queueRes.json().catch(() => ({})) as { error?: string };
          throw new Error(errData.error ?? `Error del servidor: ${queueRes.status}`);
        }

        const { sessionId, totalChunks, sourceLabel } = await queueRes.json() as {
          sessionId: string;
          totalChunks: number;
          sourceLabel: string;
        };

        toast({
          title: '✅ PDF fragmentado',
          description: `${totalChunks} fragmento(s) en cola. Las preguntas se extraerán automáticamente.`,
        });

        if (mode === 'file') {
          setImportFile(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
        if (mode === 'url') setImportUrl('');

        setImportChecklist({
          mode: 'queue',
          sessionId,
          totalChunks,
          chunksProcessed: 0,
          totalQuestions: 0,
          step1: { status: 'done', detail: `${totalChunks} fragmento(s) creados de "${sourceLabel}"` },
          step2: { status: 'pending', detail: `0/${totalChunks} fragmentos procesados (se actualiza cada 5 s)` },
          step3: { status: 'idle' },
        });
      } catch (e: unknown) {
        setUploadPhase(null);
        if (e instanceof Error && e.name === 'AbortError') {
          toast({ title: 'Importación Cancelada', description: 'El proceso fue detenido.' });
        } else {
          const msg = e instanceof Error ? e.message : 'No se pudo fragmentar el PDF.';
          toast({ variant: 'destructive', title: 'Error de Importación', description: msg });
          setImportChecklist({
            mode: 'queue',
            step1: { status: 'error', error: msg },
            step2: { status: 'idle' },
            step3: { status: 'idle' },
          });
        }
      } finally {
        setIsImporting(false);
        setUploadPhase(null);
        abortControllerRef.current = null;
      }
      return;
    }

    // ── Stream path: HTML URL or plain text ───────────────────────────────
    try {
      let res: Response;

      if (mode === 'url') {
        res = await fetch('/api/import-questions-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: importUrl.trim() }),
          signal: abort.signal,
        });
      } else {
        const formData = new FormData();
        if (mode === 'file' && importFile) {
          formData.append('file', importFile);
        } else {
          formData.append('text', importText.trim());
        }
        res = await fetch('/api/import-questions-stream', {
          method: 'POST',
          body: formData,
          signal: abort.signal,
        });
      }

      if (!res.body) throw new Error('La respuesta del servidor no contiene datos.');
      setUploadPhase(null);

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
      // Accumulate saved questions for post-import explanation generation
      const savedQuestions: SavedQuestion[] = [];

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
              setImportChecklist({
                mode: 'stream',
                totalChunks: event.totalChunks,
                chunksProcessed: 0,
                totalQuestions: 0,
                step1: { status: 'done', detail: `${event.totalChunks} fragmento(s) detectados` },
                step2: { status: 'pending', detail: `0/${event.totalChunks} fragmentos procesados` },
                step3: { status: 'idle' },
              });
              break;

            case 'chunk': {
              const timestamp = new Date().toISOString();
              const docRefs = await Promise.all(
                event.questions.map((q) =>
                  addDoc(collection(firestore, 'questions'), {
                    ...q,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                  })
                )
              );
              // Track Firestore IDs so we can attach explanations after the stream
              docRefs.forEach((docRef, idx) => {
                const q = event.questions[idx];
                savedQuestions.push({
                  firestoreId: docRef.id,
                  text: q.text as string,
                  options: q.options as string[],
                  correctAnswerIndex: q.correctAnswerIndex as number,
                  subjectId: q.subjectId as string,
                  componentId: q.componentId as string | undefined,
                  competencyId: q.competencyId as string | undefined,
                });
              });
              totalSaved += event.questionsInChunk;
              setImportChecklist((prev) =>
                prev
                  ? {
                      ...prev,
                      chunksProcessed: event.chunkIndex,
                      totalQuestions: totalSaved,
                      step2: {
                        status: 'pending',
                        detail: `${event.chunkIndex}/${event.totalChunks} fragmentos — ${totalSaved} pregunta(s) encontradas`,
                      },
                    }
                  : prev
              );
              break;
            }

            case 'chunkError':
              setImportChecklist((prev) =>
                prev
                  ? {
                      ...prev,
                      chunksProcessed: event.chunkIndex,
                      step2: {
                        ...prev.step2,
                        detail: `${event.chunkIndex}/${event.totalChunks} (fragmento ${event.chunkIndex} falló)`,
                        error: event.message,
                      },
                    }
                  : prev
              );
              break;

            case 'done':
              setImportResult({ count: totalSaved, note: event.sourceNote });
              setImportChecklist((prev) =>
                prev
                  ? {
                      ...prev,
                      step2: {
                        status: totalSaved > 0 ? 'done' : 'error',
                        detail: `${totalSaved} pregunta(s) extraídas`,
                        error: totalSaved === 0 ? 'No se extrajeron preguntas del contenido.' : undefined,
                      },
                      step3: { status: 'pending', detail: 'Generando explicaciones IA...' },
                    }
                  : prev
              );
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

      // ── Auto-generate explanations for all newly imported questions ──────
      if (savedQuestions.length > 0) {
        try {
          const batchRes = await fetch('/api/generate-explanations-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              questions: savedQuestions.map((q) => ({
                id: q.firestoreId,
                text: q.text,
                options: q.options,
                correctAnswerIndex: q.correctAnswerIndex,
                subjectId: q.subjectId,
                componentId: q.componentId,
                competencyId: q.competencyId,
              })),
            }),
          });
          if (batchRes.ok) {
            const batchData = (await batchRes.json()) as {
              results: { id: string; aiExplanation?: unknown }[];
              failed: number;
            };
            // Write explanations back to Firestore
            await Promise.all(
              batchData.results
                .filter((r) => r.aiExplanation !== undefined)
                .map((r) =>
                  updateDoc(doc(firestore, 'questions', r.id), {
                    aiExplanation: r.aiExplanation,
                    updatedAt: new Date().toISOString(),
                  })
                )
            );
            const generatedCount = savedQuestions.length - batchData.failed;
            setImportChecklist((prev) =>
              prev
                ? {
                    ...prev,
                    step3:
                      batchData.failed === 0
                        ? { status: 'done', detail: `${generatedCount} explicaciones generadas` }
                        : {
                            status: 'error',
                            detail: `${generatedCount}/${savedQuestions.length} generadas`,
                            error: `${batchData.failed} explicación(es) fallaron. Serán reintentadas automáticamente.`,
                          },
                  }
                : prev
            );
          }
        } catch (explErr) {
          console.warn('[handleImport] explanation batch failed:', explErr);
          setImportChecklist((prev) =>
            prev
              ? {
                  ...prev,
                  step3: {
                    status: 'error',
                    error: 'No se pudieron generar las explicaciones. Serán reintentadas automáticamente.',
                  },
                }
              : prev
          );
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') {
        toast({ title: 'Importación Cancelada', description: 'El proceso fue detenido.' });
        setImportChecklist(null);
      } else {
        const msg = e instanceof Error ? e.message : 'No se pudo importar el contenido.';
        toast({ variant: 'destructive', title: 'Error de Importación', description: msg });
        setImportChecklist((prev) =>
          prev
            ? {
                ...prev,
                step1: { status: 'error', error: msg },
                step2: { status: 'idle' },
                step3: { status: 'idle' },
              }
            : {
                mode: 'stream',
                step1: { status: 'error', error: msg },
                step2: { status: 'idle' },
                step3: { status: 'idle' },
              }
        );
      }
    } finally {
      setIsImporting(false);
      setUploadPhase(null);
      abortControllerRef.current = null;
    }
  };

  const cancelImport = () => {
    abortControllerRef.current?.abort();
    if (queuePollingRef.current) clearInterval(queuePollingRef.current);
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
              Elige un método: URL pública, archivo de texto (.txt / .csv / .md / .pdf) o pega el contenido directamente. Las explicaciones IA se generan automáticamente al finalizar.
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
                      Archivo de texto (.txt, .csv, .md o .pdf)
                    </Label>
                    <Input
                      ref={fileInputRef}
                      type="file"
                      accept=".txt,.csv,.md,.pdf"
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

            {isImporting && uploadPhase && (
              <div className="p-4 bg-primary/5 rounded-2xl border border-primary/20 space-y-2">
                <p className="text-xs font-bold text-primary">{uploadPhase.message}</p>
                {uploadPhase.progress !== null ? (
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-primary h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadPhase.progress}%` }}
                    />
                  </div>
                ) : (
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div className="bg-primary/70 h-2 rounded-full animate-pulse w-full" />
                  </div>
                )}
              </div>
            )}

            {/* ── 3-step import checklist ─────────────────────────────────── */}
            {importChecklist && (
              <div className="p-4 bg-muted/30 rounded-2xl border border-secondary/20 space-y-3">
                <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-2">
                  {importChecklist.mode === 'queue'
                    ? '📋 Progreso de importación (cola asíncrona)'
                    : '📋 Progreso de importación'}
                </p>

                {/* Step 1 */}
                {(() => {
                  const s = importChecklist.step1;
                  return (
                    <div className="flex items-start gap-3">
                      {s.status === 'done' ? (
                        <CheckCircle2 className="w-5 h-5 text-secondary shrink-0 mt-0.5" />
                      ) : s.status === 'error' ? (
                        <XCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                      ) : (
                        <Loader2 className="w-5 h-5 text-primary shrink-0 mt-0.5 animate-spin" />
                      )}
                      <div>
                        <p className={`text-sm font-bold ${s.status === 'error' ? 'text-destructive' : s.status === 'done' ? 'text-secondary' : 'text-primary'}`}>
                          📄 PDF recibido y fragmentado
                          {s.detail ? ` — ${s.detail}` : ''}
                        </p>
                        {s.error && (
                          <p className="text-xs text-destructive mt-1">{s.error}</p>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Step 2 */}
                {importChecklist.step2.status !== 'idle' && (() => {
                  const s = importChecklist.step2;
                  return (
                    <div className="flex items-start gap-3">
                      {s.status === 'done' ? (
                        <CheckCircle2 className="w-5 h-5 text-secondary shrink-0 mt-0.5" />
                      ) : s.status === 'error' ? (
                        <XCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                      ) : (
                        <Loader2 className="w-5 h-5 text-primary shrink-0 mt-0.5 animate-spin" />
                      )}
                      <div>
                        <p className={`text-sm font-bold ${s.status === 'error' ? 'text-destructive' : s.status === 'done' ? 'text-secondary' : 'text-primary'}`}>
                          🤖 Preguntas extraídas
                          {s.detail ? ` — ${s.detail}` : ''}
                        </p>
                        {s.error && (
                          <p className="text-xs text-amber-600 mt-1">{s.error}</p>
                        )}
                        {importChecklist.mode === 'queue' && s.status === 'pending' && (
                          <p className="text-[10px] text-muted-foreground italic mt-1">
                            ⏳ El workflow de GitHub Actions procesa fragmentos cada 10 minutos automáticamente.
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Step 3 */}
                {importChecklist.step3.status !== 'idle' && (() => {
                  const s = importChecklist.step3;
                  return (
                    <div className="flex items-start gap-3">
                      {s.status === 'done' ? (
                        <CheckCircle2 className="w-5 h-5 text-secondary shrink-0 mt-0.5" />
                      ) : s.status === 'error' ? (
                        <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                      ) : (
                        <Loader2 className="w-5 h-5 text-primary shrink-0 mt-0.5 animate-spin" />
                      )}
                      <div>
                        <p className={`text-sm font-bold ${s.status === 'error' ? 'text-amber-600' : s.status === 'done' ? 'text-secondary' : 'text-primary'}`}>
                          💡 Explicaciones IA generadas
                          {s.detail ? ` — ${s.detail}` : ''}
                        </p>
                        {s.error && (
                          <p className="text-xs text-amber-600 mt-1">{s.error}</p>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Cancel button (only while importing) */}
                {(isImporting || importChecklist.mode === 'queue') && (
                  <div className="flex justify-end pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={cancelImport}
                      className="text-xs text-destructive border-destructive/50 hover:bg-destructive/5 h-7"
                    >
                      Cancelar importación
                    </Button>
                  </div>
                )}
              </div>
            )}

            {importResult && !importChecklist && (
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
