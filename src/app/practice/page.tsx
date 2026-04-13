import { GameNavbar } from '@/components/game-navbar';
import { Button } from '@/components/ui/button';
import { BookOpen, Calculator, Globe, Atom, Book, Play, Heart, Shield } from 'lucide-react';
import Link from 'next/link';

export default function PracticePage() {
  return (
    <div className="min-h-screen bg-background">
      <GameNavbar />
      <main className="max-w-7xl mx-auto p-6 space-y-12">
        <header className="space-y-2">
          <h1 className="text-4xl font-black uppercase tracking-tight">Banco de Preguntas Saber 11</h1>
          <p className="text-muted-foreground text-lg">Entrenamiento especializado por competencias y componentes oficiales del ICFES.</p>
        </header>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          <SubjectCard 
            title="Matemáticas" 
            icon={<Calculator className="w-10 h-10" />} 
            color="bg-blue-500" 
            stats="Comp: Geométrico, Métrico, Variacional, Aleatorio"
            link="/practice/matematicas"
            desc="Dominio de razonamiento cuantitativo, interpretación y formulación."
          />
          <SubjectCard 
            title="Lectura Crítica" 
            icon={<BookOpen className="w-10 h-10" />} 
            color="bg-green-500" 
            stats="Comp: Identificar, Comprender, Reflexionar"
            link="/practice/lectura"
            desc="Análisis de textos continuos y discontinuos con sentido crítico."
          />
          <SubjectCard 
            title="Ciencias Naturales" 
            icon={<Atom className="w-10 h-10" />} 
            color="bg-yellow-500" 
            stats="Comp: Biológico, Químico, Físico, CTS"
            link="/practice/naturales"
            desc="Uso del conocimiento, explicación de fenómenos e indagación."
          />
          <SubjectCard 
            title="Sociales y Ciudadanas" 
            icon={<Globe className="w-10 h-10" />} 
            color="bg-red-500" 
            stats="Comp: Pensamiento Social, Multiperspectivismo"
            link="/practice/sociales"
            desc="Comprensión del entorno social y pensamiento sistémico."
          />
          <SubjectCard 
            title="Inglés" 
            icon={<Book className="w-10 h-10" />} 
            color="bg-purple-500" 
            stats="Marco Común: A1, A2, B1, B+"
            link="/practice/ingles"
            desc="Uso funcional del lenguaje y comprensión de lectura."
          />
          <SubjectCard 
            title="Socioemocional" 
            icon={<Heart className="w-10 h-10" />} 
            color="bg-pink-500" 
            stats="Habilidades: Empatía, Emociones, Decisiones"
            link="/practice/socioemocional"
            desc="Evaluación de competencias ciudadanas y manejo de situaciones."
            isSpecial
          />
        </div>

        <section className="bg-primary/5 p-8 rounded-3xl border-2 border-dashed border-primary/20 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="bg-primary p-3 rounded-2xl text-white">
              <Shield className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-xl font-bold">Ruta de IA Personalizada</h3>
              <p className="text-sm text-muted-foreground">Deja que nuestra IA cree un set de preguntas basado en tus debilidades.</p>
            </div>
          </div>
          <Button className="game-button bg-primary text-white px-8 h-12">Generar Misión</Button>
        </section>
      </main>
    </div>
  );
}

function SubjectCard({ 
  title, icon, color, stats, link, desc, isSpecial = false 
}: { 
  title: string; icon: React.ReactNode; color: string; stats: string; link: string; desc: string; isSpecial?: boolean 
}) {
  return (
    <div className={`group game-card bg-card border-2 border-primary/5 hover:border-primary/40 ${isSpecial ? 'glow-accent border-accent/40' : ''}`}>
      <div className={`h-24 ${color} flex items-center justify-center text-white relative overflow-hidden`}>
        <div className="absolute inset-0 opacity-10 scale-150 rotate-12">{icon}</div>
        <div className="relative z-10 p-4 rounded-full bg-white/20 backdrop-blur-sm border-2 border-white/40">
          {icon}
        </div>
      </div>
      <div className="p-6 space-y-4">
        <div>
          <h3 className="text-2xl font-black uppercase tracking-tighter leading-none mb-1">{title}</h3>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{stats}</p>
        </div>
        <p className="text-sm text-muted-foreground min-h-[40px] leading-snug">
          {desc}
        </p>
        <Button className={`w-full game-button ${isSpecial ? 'bg-accent hover:bg-accent/90' : 'bg-primary hover:bg-primary/90'} h-12 shadow-lg group-hover:scale-105 transition-transform`} asChild>
          <Link href={link}>
            <Play className="w-4 h-4 mr-2" />
            Entrenar Ahora
          </Link>
        </Button>
      </div>
    </div>
  );
}
