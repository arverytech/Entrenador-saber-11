import type {Metadata} from 'next';
import './globals.css';
import { BrandingProvider } from '@/components/branding-provider';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { Toaster } from '@/components/ui/toaster';

export const metadata: Metadata = {
  title: 'Entrenador Saber 11 - IED Nicolas Buenaventura',
  description: 'Plataforma gamificada de preparación para el examen Saber 11',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&family=Open+Sans:wght@400;600&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased min-h-screen bg-background text-foreground">
        <FirebaseClientProvider>
          <BrandingProvider>
            {children}
            <Toaster />
          </BrandingProvider>
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
