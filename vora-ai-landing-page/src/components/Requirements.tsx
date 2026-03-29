import { motion } from 'motion/react';
import { Cpu, HardDrive, Wifi, Laptop } from 'lucide-react';

export default function Requirements() {
  return (
    <section id="requirements" className="py-24 px-6 relative z-10">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">System Requirements</h2>
          <p className="text-gray-400">Built for modern hardware to ensure a seamless experience.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass p-6 rounded-2xl flex items-start gap-4"
          >
            <Laptop className="w-6 h-6 text-cyan-400 shrink-0" />
            <div>
              <h4 className="font-semibold text-white mb-1">Operating System</h4>
              <p className="text-sm text-gray-400">macOS 13.0+ (Apple Silicon only) or Windows 11 (22H2+)</p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="glass p-6 rounded-2xl flex items-start gap-4"
          >
            <HardDrive className="w-6 h-6 text-blue-400 shrink-0" />
            <div>
              <h4 className="font-semibold text-white mb-1">Memory</h4>
              <p className="text-sm text-gray-400">8GB RAM minimum, 16GB recommended for heavy workflows</p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="glass p-6 rounded-2xl flex items-start gap-4"
          >
            <Cpu className="w-6 h-6 text-cyan-400 shrink-0" />
            <div>
              <h4 className="font-semibold text-white mb-1">Processor</h4>
              <p className="text-sm text-gray-400">Apple M1/M2/M3 or Intel Core i5 10th Gen / AMD Ryzen 5 4000 series</p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="glass p-6 rounded-2xl flex items-start gap-4"
          >
            <Wifi className="w-6 h-6 text-blue-400 shrink-0" />
            <div>
              <h4 className="font-semibold text-white mb-1">Network</h4>
              <p className="text-sm text-gray-400">Broadband internet connection required for initial setup and cloud features</p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
