import { motion } from 'motion/react';
import { Eye, Command, Shield, Zap } from 'lucide-react';

const features = [
  {
    icon: <Eye className="w-6 h-6 text-cyan-400" />,
    title: "Context-Aware Intelligence",
    description: "VORA sees what's on your screen. Ask it to summarize the current document or reply to the email you're reading."
  },
  {
    icon: <Command className="w-6 h-6 text-blue-400" />,
    title: "Cross-App Actions",
    description: "Don't just get answers—get things done. VORA can control your browser, send messages, and manage your calendar."
  },
  {
    icon: <Shield className="w-6 h-6 text-cyan-400" />,
    title: "Privacy First",
    description: "Your voice data is processed locally whenever possible. Cloud interactions are end-to-end encrypted and never used for training."
  },
  {
    icon: <Zap className="w-6 h-6 text-blue-400" />,
    title: "Always Ready",
    description: "Just say the wake word. No need to switch windows or use keyboard shortcuts. VORA is always there when you need it."
  }
];

export default function Features() {
  return (
    <section id="features" className="py-24 px-6 relative z-10">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-3xl md:text-5xl font-display font-bold mb-4"
          >
            More than an assistant. <br className="md:hidden" /> An agent.
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-gray-400 max-w-2xl mx-auto"
          >
            VORA doesn't just answer questions. It executes complex workflows across your entire operating system.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="glass p-8 rounded-3xl glass-hover transition-all duration-300 group"
            >
              <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 border border-white/5">
                {feature.icon}
              </div>
              <h3 className="text-xl font-display font-semibold mb-3 text-white group-hover:text-cyan-300 transition-colors">{feature.title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
