import { Card, CardContent } from '@/components/ui/card';
import { AiGeneratedContent } from '@/lib/ai'; // Import the interface
import { CheckCircle } from 'lucide-react';
import Image from 'next/image';

interface LandingPageRendererProps {
  data: AiGeneratedContent;
  images?: string[]; // Array of Cloudinary URLs
  namaUsaha: string;
}

export function LandingPageRenderer({ data, images = [], namaUsaha }: LandingPageRendererProps) {
  // Provide default values or handle missing data gracefully
  const { headline, subheadline, description, features = [], primaryColor = '#3B82F6' } =
    data || {};

  // TODO: UX/Styling - Review padding, margins, font sizes, line heights for Notion feel.
  // TODO: UX/Styling - Ensure perfect responsiveness on various mobile sizes.
  // TODO: Feature - Implement logic for different `layoutStyle` if needed.

  // Simple style object for primary color accents
  const primaryStyle = {
    color: primaryColor,
    // If you want to use it for backgrounds/borders:
    // backgroundColor: primaryColor,
    // borderColor: primaryColor,
  };
  // TODO: Add logic for different layoutStyle if needed

  return (
    <div className="w-full max-w-4xl mx-auto pb-12 pt-12 md:pt-16 px-4 sm:px-6 lg:px-8 space-y-12 md:space-y-16">
      {/* Header Section */}
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl md:text-6xl mb-4">
          {headline || `Selamat Datang di ${namaUsaha}`}
        </h1>
        <p className="text-lg text-slate-600 sm:text-xl max-w-2xl mx-auto">
          {subheadline || 'Solusi terbaik untuk kebutuhan Anda'}
        </p>
      </div>

      {/* Description Section */}
      <Card className="shadow-lg overflow-hidden border border-slate-200/60">
        <CardContent className="p-8 md:p-10">
            <h2 className="text-2xl md:text-3xl font-semibold text-slate-800 mb-4 md:mb-5">
                Tentang Kami
            </h2>
            <p className="text-slate-600 leading-relaxed md:text-lg">
                {description || 'Kami menyediakan produk/jasa berkualitas...'}
            </p>
        </CardContent>
      </Card>

      {/* Features Section */}
      {features && features.length > 0 && (
        <div>
          <h2 className="text-2xl md:text-3xl font-semibold text-slate-800 mb-6 md:mb-8 text-center">
            Keunggulan Kami
          </h2>
          <div className="flex flex-wrap justify-center gap-6">
            {features.map((feature, index) => (
              <div 
                key={index} 
                className="flex items-start space-x-4 p-6 bg-slate-50 rounded-lg border border-slate-200/60 w-full sm:w-[47%] lg:w-[30%] grow-0 shrink-0"
              >
                <CheckCircle className="h-6 w-6 flex-shrink-0 mt-1 text-green-600" style={primaryStyle} />
                <p className="text-slate-700 leading-relaxed">{feature}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CTA section is handled by StickyCTA outside this renderer */}

    </div>
  );
}
