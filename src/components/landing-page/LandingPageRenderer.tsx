"use client"; // Required for framer-motion

import { motion } from "framer-motion"; // Import motion
import { Check, Edit } from "lucide-react";
import React from "react";

import { Button } from "@/components/ui/button"; // Assuming Button uses CSS vars
import { AiGeneratedContent } from "@/lib/ai"; // Keep AiGeneratedContent
import { cn } from "@/lib/utils";
// import { useQueryClient } from "@tanstack/react-query"; // Removed

import { InlineEditText } from "./InlineEditText"; // Import the new component

interface LandingPageRendererProps {
  data: AiGeneratedContent & { // Ensure extended type here too or update source
      featuresTitle?: string;
      // Add other title fields if needed within Renderer scope
  };
  businessName: string;
  isOwner: boolean;
  // pageId: string; // Removed
  // slug: string; // Removed
  handleSaveContent: (fieldKey: string, newValue: string) => Promise<void>; // Added prop
}

// Helper component for CTA to manage its edit state
const CtaSectionContent: React.FC<{ 
    isOwner: boolean;
    ctaText: string;
    whatsappCTA: boolean;
    whatsappNumber: string | null | undefined;
    handleSaveContent: (fieldKey: string, newValue: string) => Promise<void>;
    handleCTAClick: () => void;
}> = ({ 
    isOwner,
    ctaText,
    whatsappCTA,
    whatsappNumber,
    handleSaveContent,
    handleCTAClick 
}) => {
    const [isEditingCta, setIsEditingCta] = React.useState(false); 

    if (isOwner && isEditingCta) {
        return (
            <InlineEditText
               as="span" 
               initialValue={ctaText || (whatsappCTA ? "Hubungi via WhatsApp" : "Lihat Penawaran")}
               isOwner={isOwner}
               fieldKey="ctaText"
               onSave={async (key: string, value: string) => {
                   await handleSaveContent(key, value);
                   setIsEditingCta(false); 
               }}
               onCancel={() => setIsEditingCta(false)} 
               className="inline-block text-lg" 
               inputClassName="text-lg px-2 py-1 border border-primary rounded bg-background text-foreground focus:ring-1 focus:ring-primary"
               placeholder="Teks Tombol Aksi"
               hideControls={true}
            />
        );
    } else {
        return (
            <Button
                size="lg"
                className="cursor-pointer w-full max-w-xs shadow-lg bg-primary text-primary-foreground hover:bg-primary/90 text-lg px-8 py-4 relative group"
                onClick={!isOwner && whatsappCTA && whatsappNumber ? handleCTAClick : undefined}
            >
                <span 
                    className={cn(
                        "relative", 
                        isOwner && "cursor-pointer group-hover:bg-primary/80 p-1 -m-1 rounded transition-colors"
                    )}
                    onClick={(e) => {
                        if (isOwner) {
                            e.stopPropagation(); 
                            setIsEditingCta(true);
                        }
                    }}
                >
                    {ctaText || (whatsappCTA ? "Hubungi via WhatsApp" : "Lihat Penawaran")}
                     {isOwner && <Edit className="h-3 w-3 absolute top-0.5 right-0.5 text-primary-foreground/70 opacity-0 group-hover:opacity-100 transition-opacity" />} 
                </span>
            </Button>
        );
    }
};

export function LandingPageRenderer({
  data,
  businessName,
  isOwner,
  // pageId, // Removed
  // slug, // Removed
  handleSaveContent, // Receive handler
}: LandingPageRendererProps) {
  // const queryClient = useQueryClient(); // Removed

  // Destructure content safely, providing defaults
  const {
    headline = `Selamat Datang di ${businessName}`,
    subheadline = `Temukan penawaran terbaik dari ${businessName}`,
    description = "Kami menyediakan produk/layanan berkualitas untuk Anda.",
    featuresTitle = "Fitur Utama", // Use default if not in data
    features = [
      "Fitur Unggulan 1",
      "Fitur Unggulan 2",
      "Fitur Unggulan 3",
    ],
    ctaText = "Hubungi Kami",
    whatsappCTA = false,
    whatsappNumber,
    layoutStyle = "standard",
    font = "Inter", // Assuming Inter corresponds to a CSS class like .font-inter
  } = data || {};

  // --- API Call Handler REMOVED (Now passed as prop) ---
  // const handleSaveContent = async (fieldKey: string, newValue: string) => { ... }

  // --- handleCTAClick REMOVED (Now part of CtaSectionContent or passed differently if needed) ---
  // handleCTAClick logic might need to be passed into CtaSectionContent if required there
   const handleCTAClick = () => {
    if (whatsappCTA && whatsappNumber) {
      const waLink = `https://wa.me/${whatsappNumber.replace(/\D/g, "")}`;
      window.open(waLink, "_blank");
    }
  };

  // Animation Variants (can be customized)
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.15, ease: "easeOut" },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  };

  // Determine text alignment based on layoutStyle or tone
  const textAlignClass = layoutStyle === 'minimal' ? "text-center" : "text-left";

  // Apply font class - ensure this class exists in your global CSS
  const fontClass = font === 'Poppins' ? "font-poppins" : "font-inter";

  return (
    <motion.div
      className={cn("container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12 md:py-16", fontClass)} // Use cn here
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header Section */}
      <motion.header className={cn(textAlignClass, "mb-10 md:mb-14")} variants={itemVariants}> {/* Use cn */}
         <InlineEditText
           as="h1"
           initialValue={headline}
           isOwner={isOwner}
           fieldKey="headline"
           onSave={handleSaveContent} // Use passed prop
           className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-4 text-foreground"
           inputClassName="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight"
           placeholder="Judul Utama Halaman Anda"
         />
         <InlineEditText
           as="p"
           initialValue={subheadline}
           isOwner={isOwner}
           fieldKey="subheadline"
           onSave={handleSaveContent} // Use passed prop
           className="text-lg md:text-xl lg:text-2xl text-muted-foreground max-w-3xl mx-auto"
           inputClassName="text-lg md:text-xl lg:text-2xl"
           placeholder="Sub-judul atau tagline singkat"
         />
      </motion.header>

      {/* Description Section */}
      <motion.section className="mb-12 md:mb-16 text-lg leading-relaxed text-foreground" variants={itemVariants}>
         <InlineEditText
            as="textarea"
            initialValue={description}
            isOwner={isOwner}
            fieldKey="description"
            onSave={handleSaveContent} // Use passed prop
            className="w-full"
            inputClassName="text-lg leading-relaxed"
            placeholder="Jelaskan lebih detail tentang usaha atau penawaran Anda..."
          />
      </motion.section>

      {/* Features Section */}
      {features && features.length > 0 && (
        <motion.section className="mb-12 md:mb-16" variants={itemVariants}>
            <InlineEditText
              as="h2"
              initialValue={featuresTitle} // Use destructured value with default
              isOwner={isOwner}
              fieldKey="featuresTitle" // Use the new field key
              onSave={handleSaveContent} // Use passed prop
              className="text-2xl md:text-3xl font-semibold mb-6 md:mb-8 text-foreground"
              inputClassName="text-2xl md:text-3xl font-semibold"
              placeholder="Judul Bagian Fitur"
            />
           {/* <h2 className="text-2xl md:text-3xl font-semibold mb-6 md:mb-8 text-foreground">Fitur Utama</h2> */}

          <ul className="space-y-4">
            {features.map((feature, index) => (
              <li key={index} className="flex items-start">
                <div className="flex-shrink-0">
                  <Check className="h-6 w-6 text-primary mr-3 mt-1" />
                </div>
                 <InlineEditText
                    as="span"
                    initialValue={feature}
                    isOwner={isOwner}
                    fieldKey={`features[${index}]`}
                    onSave={handleSaveContent} // Use passed prop
                    className="flex-grow text-foreground"
                    inputClassName="text-base"
                    placeholder="Deskripsi fitur..."
                  />
              </li>
            ))}
          </ul>
        </motion.section>
      )}

      {/* Call to Action Section - Using the helper component */}
      <motion.section className="text-center" variants={itemVariants}>
         <CtaSectionContent 
            isOwner={isOwner}
            ctaText={ctaText || (whatsappCTA ? "Hubungi via WhatsApp" : "Lihat Penawaran")}
            whatsappCTA={!!whatsappCTA} // Ensure boolean
            whatsappNumber={whatsappNumber}
            handleSaveContent={handleSaveContent} // Pass handler down
            handleCTAClick={handleCTAClick} // Pass click handler down
         />
      </motion.section>

    </motion.div>
  );
}

// Re-define CtaSectionContent here as it was removed by the edit model
// Ensure it uses the props passed down correctly
// const CtaSectionContentReTyped: React.FC<{
//     isOwner: boolean;
//     ctaText: string;
//     whatsappCTA: boolean;
//     whatsappNumber: string | null | undefined;
//     handleSaveContent: (fieldKey: string, newValue: string) => Promise<void>;
//     handleCTAClick: () => void;
// }> = ({
//     isOwner,
//     ctaText,
//     whatsappCTA,
//     whatsappNumber,
//     handleSaveContent,
//     handleCTAClick
// }) => {
//     const [isEditingCta, setIsEditingCta] = React.useState(false);

//     if (isOwner && isEditingCta) {
//         return (
//             <InlineEditText
//                as="span"
//                initialValue={ctaText} // Already has default from parent
//                isOwner={isOwner}
//                fieldKey="ctaText"
//                onSave={async (key: string, value: string) => {
//                    await handleSaveContent(key, value);
//                    setIsEditingCta(false);
//                }}
//                onCancel={() => setIsEditingCta(false)}
//                className="inline-block text-lg"
//                inputClassName="text-lg px-2 py-1 border border-primary rounded bg-background text-foreground focus:ring-1 focus:ring-primary"
//                placeholder="Teks Tombol Aksi"
//                hideControls={true}
//             />
//         );
//     } else {
//         return (
//             <Button
//                 size="lg"
//                 className="w-full max-w-xs shadow-lg bg-primary text-primary-foreground hover:bg-primary/90 text-lg px-8 py-4 relative group"
//                 onClick={!isOwner ? handleCTAClick : undefined} // Only trigger main click if not owner
//             >
//                 <span
//                     className={cn(
//                         "relative",
//                         isOwner && "cursor-pointer group-hover:bg-primary/80 p-1 -m-1 rounded transition-colors"
//                     )}
//                     onClick={(e) => {
//                         if (isOwner) {
//                             e.stopPropagation();
//                             setIsEditingCta(true);
//                         }
//                     }}
//                 >
//                     {ctaText}
//                      {isOwner && <Edit className="h-3 w-3 absolute top-0.5 right-0.5 text-primary-foreground/70 opacity-0 group-hover:opacity-100 transition-opacity" />}
//                 </span>
//             </Button>
//         );
//     }
// };
