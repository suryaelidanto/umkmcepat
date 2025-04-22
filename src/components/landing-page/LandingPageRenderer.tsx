'use client'; // Required for framer-motion

import { Card, CardContent } from '@/components/ui/card';
import { AiGeneratedContent } from '@/lib/ai'; // Import the interface
import { CheckCircle } from 'lucide-react';
import Image from 'next/image';
import { motion } from 'framer-motion'; // Import motion

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

  // Animation Variants (can be shared or specific)
  const sectionVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.6, ease: "easeOut", staggerChildren: 0.1 }, // Add staggerChildren
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  };

  return (
    <motion.div // Wrap the main container
      className="w-full max-w-4xl mx-auto pb-16 pt-16 md:pt-20 px-4 sm:px-6 lg:px-8 space-y-16 md:space-y-20"
      variants={sectionVariants} // Apply variants to container
      initial="hidden"
      animate="visible" // Animate immediately on load
    >
      {/* Header Section - Beri lebih banyak ruang */}
      <motion.div className="text-center space-y-4 md:space-y-5" variants={itemVariants}>
        <motion.h1 
          className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl md:text-6xl"
          style={primaryStyle} // Terapkan primary color ke headline
          variants={itemVariants} // Individual items can also animate
        >
          {headline || `Selamat Datang di ${namaUsaha}`}
        </motion.h1>
        <motion.p 
          className="text-lg text-slate-600 sm:text-xl md:text-2xl leading-relaxed max-w-3xl mx-auto"
          variants={itemVariants}
        >
          {subheadline || 'Solusi terbaik untuk kebutuhan Anda'}
        </motion.p>
      </motion.div>

      {/* Description Section - Tambah hover effect */}
      <motion.div variants={sectionVariants} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }}>
        <Card className="shadow-lg overflow-hidden border border-slate-200/60 transition duration-300 hover:shadow-xl">
          <CardContent className="p-8 md:p-10">
              <motion.h2 variants={itemVariants} className="text-2xl md:text-3xl font-semibold text-slate-800 mb-4 md:mb-5">
                  Tentang Kami
              </motion.h2>
              <motion.p variants={itemVariants} className="text-slate-600 leading-relaxed md:text-lg">
                  {description || 'Kami menyediakan produk/jasa berkualitas...'}
              </motion.p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Features Section */}
      {features && features.length > 0 && (
        <motion.div 
          className="bg-gradient-to-br from-slate-50 to-slate-100 p-8 md:p-10 rounded-lg shadow-inner border border-slate-200/50"
          variants={sectionVariants} 
          initial="hidden" 
          whileInView="visible" 
          viewport={{ once: true, amount: 0.2 }}
        >
          <motion.h2 variants={itemVariants} className="text-2xl md:text-3xl font-semibold text-slate-800 mb-8 md:mb-10 text-center">
            Keunggulan Kami
          </motion.h2>
          <motion.div className="flex flex-wrap justify-center gap-6" variants={sectionVariants}> {/* Stagger children */}
            {features.map((feature, index) => (
              <motion.div 
                key={index} 
                className="flex items-start space-x-4 p-6 bg-white rounded-lg border border-slate-200/60 w-full sm:w-[47%] lg:w-[30%] grow-0 shrink-0 shadow-md transition duration-300 hover:shadow-lg"
                variants={itemVariants} // Animate each feature item
              >
                <CheckCircle className="h-6 w-6 flex-shrink-0 mt-1" style={primaryStyle} />
                <p className="text-slate-700 leading-relaxed">{feature}</p>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      )}

      {/* CTA section is handled by StickyCTA outside this renderer */}

    </motion.div> // Close main container motion.div
  );
}
