
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { Trophy, Target, Sparkles, Gamepad2, Rocket, Users } from 'lucide-react';

export default function Home() {
  const heroImage = PlaceHolderImages.find(img => img.id === 'gamified-hero')?.imageUrl || "";

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground overflow-hidden">
      {/* Background patterns */}
      <div className="fixed inset-0 pointer-events-none opacity-5">
        <div className="absolute top-0 left-0 w-96 h-96 bg-primary rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-secondary rounded-full blur-[120px]" />
      </div>

      <header className="relative z-10 w-full px-6 py-6 max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-primary p-2 rounded-xl glow-primary">
            <Trophy className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="font-headline font-bold text-2xl tracking-tighter leading-none">
              Entrenador <span className="text-primary">Saber 11</span>
            </h1>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Gaming Educational Platform</p>
          </div>
        </div>
        <div className="flex gap-4">
          <Button variant="ghost" asChild className="hidden sm:flex font-bold">
            <Link href="/auth/login">Entrar</Link>
          </Button>
          <Button asChild className="game-button bg-primary hover:bg-primary/90 glow-primary">
            <Link href="/auth/register">Empezar Gratis</Link>
          </Button>
        </div>
      </header>

      <main className="relative z-10 flex-1 flex flex-col items-center">
        {/* Hero Section */}
        <section className="w-full max-w-7xl px-6 pt-12 pb-24 grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 bg-secondary/20 text-secondary px-4 py-2 rounded-full border border-secondary/30">
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-bold uppercase tracking-wider">¡Nueva versión disponible!</span>
            </div>
            <h2 className="font-headline font-black text-5xl md:text-7xl leading-[1.1] tracking-tight">
              Prepara tu futuro <br />
              <span className="text-primary underline decoration-accent underline-offset-8">Jugando</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-lg leading-relaxed">
              La plataforma definitiva para el Saber 11. Aprende con misiones de IA, compite en rankings y domina cada asignatura con nuestro banco de preguntas gamificado.
            </p>
            <div className="flex flex-wrap gap-4">
              <Button size="lg" asChild className="game-button h-16 px-8 text-lg bg-primary hover:bg-primary/90 glow-primary">
                <Link href="/auth/register">Prueba de 7 Días Gratis</Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="game-button h-16 px-8 text-lg border-2 hover:bg-muted">
                <Link href="#features">Ver Características</Link>
              </Button>
            </div>
            <div className="flex items-center gap-6 pt-4">
              <div className="flex -space-x-4">
                {[1,2,3,4].map(i => (
                  <div key={i} className="w-12 h-12 rounded-full border-2 border-background overflow-hidden">
                    <Image src={`https://picsum.photos/seed/user${i}/48/48`} alt="user" width={48} height={48} />
                  </div>
                ))}
              </div>
              <p className="text-sm font-bold">
                <span className="text-primary">+2,500</span> estudiantes entrenando hoy
              </p>
            </div>
          </div>

          <div className="relative group">
            <div className="absolute -inset-4 bg-gradient-to-tr from-primary/30 to-secondary/30 rounded-3xl blur-2xl group-hover:opacity-100 opacity-50 transition-opacity" />
            <div className="relative game-card bg-card border-4 border-primary/20 aspect-video lg:aspect-square flex items-center justify-center">
              <Image 
                src={heroImage} 
                alt="Game Hero" 
                fill 
                className="object-cover opacity-90 group-hover:scale-105 transition-transform duration-700"
                data-ai-hint="gaming education hero"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-8">
                <div className="text-white space-y-2">
                  <div className="flex gap-2">
                    <span className="px-3 py-1 bg-secondary rounded-full text-xs font-bold">LIVE</span>
                    <span className="px-3 py-1 bg-accent rounded-full text-xs font-bold">SIMULACRO</span>
                  </div>
                  <h3 className="font-bold text-2xl">Misión del Día: Desafío de Lectura Crítica</h3>
                  <p className="text-sm opacity-80">Únete ahora y gana 500 puntos extra.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section id="features" className="w-full bg-muted/50 py-24 px-6 border-y-2 border-primary/10">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16 space-y-4">
              <h2 className="font-headline font-black text-4xl uppercase">Tu Arsenal de Preparación</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">Diseñado para maximizar tu puntaje combinando la ciencia del aprendizaje con la diversión de los videojuegos.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              <FeatureCard 
                icon={<Target className="w-8 h-8 text-primary" />} 
                title="Ruta Adaptativa IA" 
                desc="Nuestra IA analiza tus debilidades y crea misiones personalizadas para que mejores donde más lo necesitas."
              />
              <FeatureCard 
                icon={<Gamepad2 className="w-8 h-8 text-secondary" />} 
                title="Banco de Preguntas" 
                desc="Miles de preguntas reales clasificadas por competencias. Gana puntos, sube de nivel y desbloquea medallas."
              />
              <FeatureCard 
                icon={<Rocket className="w-8 h-8 text-accent" />} 
                title="Modo Power-Up" 
                desc="Usa comodines en tus prácticas para eliminar opciones incorrectas o ganar tiempo extra. ¡Aprender es divertido!"
              />
              <FeatureCard 
                icon={<Sparkles className="w-8 h-8 text-primary" />} 
                title="Simulacros Full" 
                desc="Exámenes idénticos al real con temporizador y ranking nacional. Mide tu progreso con precisión."
              />
              <FeatureCard 
                icon={<Users className="w-8 h-8 text-secondary" />} 
                title="Ranking Global" 
                desc="Compite contra tus amigos y estudiantes de todo el país. Los mejores ganan recompensas exclusivas."
              />
              <FeatureCard 
                icon={<Trophy className="w-8 h-8 text-accent" />} 
                title="Logros y Medallas" 
                desc="Convierte tu esfuerzo en una colección de trofeos digitales. Celebra cada pequeño avance."
              />
            </div>
          </div>
        </section>
      </main>

      <footer className="w-full py-12 px-6 border-t-2 border-primary/10 text-center">
        <p className="text-sm text-muted-foreground">
          © {new Date().getFullYear()} Entrenador Saber 11 - Desarrollado para <strong>IED Nicolas Buenaventura</strong>.
        </p>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="game-card p-8 bg-card border-primary/10 hover:border-primary/40">
      <div className="mb-4 bg-muted w-16 h-16 rounded-2xl flex items-center justify-center">
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-2 uppercase tracking-tight">{title}</h3>
      <p className="text-muted-foreground text-sm leading-relaxed">{desc}</p>
    </div>
  );
}
