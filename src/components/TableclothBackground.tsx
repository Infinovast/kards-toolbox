import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

export default function TableclothBackground({ source }: { source: string | null | undefined }) {
  const reducedMotion = useReducedMotion();
  return <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden" data-tablecloth={source || ''}>
    <AnimatePresence initial={false}>
      {source && <motion.div key={source} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: reducedMotion ? 0 : 0.3, ease: 'easeInOut' }}
        className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url("${source}")` }} />}
    </AnimatePresence>
  </div>;
}
