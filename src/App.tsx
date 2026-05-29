import { useState, useEffect, useRef, DragEvent, ClipboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import { 
  Settings, Sparkles, Upload, Copy, Check, History, Clock, ArrowRight, 
  AlertCircle, Eye, EyeOff, Image as ImageIcon, X, Info, Trash2, FileText, 
  ChevronRight, ExternalLink, Loader2
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

interface HistoryItem {
  id: string;
  title: string;
  modelLabel: string;
  modelId: string;
  inputType: 'text' | 'image';
  inputText: string;
  inputImage?: string;
  outputMarkdown: string;
  timestamp: string;
}

type StepStatus = 'waiting' | 'processing' | 'completed' | 'error';
interface GenerationSteps {
  step1: StepStatus;
  step2: StepStatus;
  step3: StepStatus;
}

const PRESETS = [
  {
    name: "App kiểm tra bài cũ Toán 10",
    text: "Ứng dụng giúp học sinh lớp 10 học kỳ I tự kiểm tra lại kiến thức cũ môn Toán qua hệ thống các câu hỏi trắc nghiệm ngắn, có giải đáp chi tiết, hài hước và thân thiện."
  },
  {
    name: "Quản lý chi tiêu",
    text: "Chuyên gia tài chính thông minh đồng hành, lập kế hoạch ngân sách hàng tháng, đưa ra lời khuyên tiết kiệm cực đoan nhưng thực tế."
  },
  {
    name: "Creative Writer Bot",
    text: "Trợ lý sáng tạo viết lách chuyên nghiệp, có khả năng lên cấu trúc bài viết, sáng tạo cốt truyện kịch tính cho truyện ngắn và hiệu chỉnh câu chữ."
  }
];

export default function App() {
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('gemini_api_key') || '');
  const [showApiModal, setShowApiModal] = useState<boolean>(false);
  const [apiInput, setApiInput] = useState<string>('');
  const [showApiKeyText, setShowApiKeyText] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<'text' | 'image'>('text');
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3-flash-preview');
  const [textInput, setTextInput] = useState<string>('');
  
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string>('');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [stepsStatus, setStepsStatus] = useState<GenerationSteps>({
    step1: 'waiting', step2: 'waiting', step3: 'waiting'
  });
  
  const [generatedInstruction, setGeneratedInstruction] = useState<string>(`# Expert Assistant Custom Instruction\n\nVui lòng điền thông tin bên trái và bấm **Tạo lệnh** để bắt đầu.\n\nHệ thống sẽ thiết kế System Instruction chuẩn hóa với các thông tin:\n- **Role** (Vai trò)\n- **Objective** (Mục tiêu tối thượng)\n- **Guidelines** (Chỉ dẫn cụ thể)\n- **Tone** (Giọng điệu ứng xử)\n- **Output Format** (Cấu trúc đầu ra hoàn chỉnh)`);
  
  const [copied, setCopied] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [history, setHistory] = useState<HistoryItem[]>(() => {
    const saved = localStorage.getItem('ai_instruction_history');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    setApiInput(apiKey);
    if (!apiKey) setShowApiModal(true);
  }, [apiKey]);

  const handleSaveApiKey = () => {
    const sanitized = apiInput.trim();
    localStorage.setItem('gemini_api_key', sanitized);
    setApiKey(sanitized);
    setShowApiModal(false);
    setErrorMsg(null);
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Vui lòng chỉ tải lên định dạng hình ảnh (JPG, PNG, WebP)');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setSelectedImage(e.target.result as string);
        setImageMimeType(file.type);
        setErrorMsg(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(generatedInstruction);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setErrorMsg('Không thể sao chép văn bản, hãy bôi đen và copy thủ công.');
    }
  };

  const handleExportWord = () => {
    const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Export HTML To Doc</title></head><body>";
    const footer = "</body></html>";
    let contentHTML = generatedInstruction
        .replace(/\n/g, '<br>')
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
        .replace(/#(.*?)\n/g, '<h1>$1</h1>');
    
    const sourceHTML = header + contentHTML + footer;
    const source = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(sourceHTML);
    const fileDownload = document.createElement("a");
    document.body.appendChild(fileDownload);
    fileDownload.href = source;
    fileDownload.download = 'AI_Instruction.doc';
    fileDownload.click();
    document.body.removeChild(fileDownload);
  };

  const handleGenerateInstruction = async () => {
    if (!apiKey) {
      setShowApiModal(true);
      setErrorMsg("Vui lòng thiết lập Gemini API Key tại phần cấu hình trước khi chạy.");
      return;
    }
    if (activeTab === 'text' && !textInput.trim()) {
      setErrorMsg("Hãy nhập ý tưởng của bạn trước khi bắt đầu tạo.");
      return;
    }
    if (activeTab === 'image' && !selectedImage) {
      setErrorMsg("Vui lòng tải lên một hình ảnh.");
      return;
    }

    setIsGenerating(true);
    setErrorMsg(null);
    setGeneratedInstruction('');
    setStepsStatus({ step1: 'waiting', step2: 'waiting', step3: 'waiting' });

    try {
      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });

      const fallbackList = ['gemini-3-flash-preview', 'gemini-3-pro-preview', 'gemini-2.5-flash'];
      const startIndex = fallbackList.indexOf(selectedModel);
      const modelsToTry = startIndex !== -1 ? fallbackList.slice(startIndex) : fallbackList;

      // API Call wrapper with fallback logic
      const callApiWithRetry = async (promptContents: any) => {
        let lastErr: any = null;
        let successModel = selectedModel;
        let responseText = "";

        for (const model of modelsToTry) {
          try {
            successModel = model;
            const result = await ai.models.generateContent({
              model: model,
              contents: promptContents
            });
            responseText = result.text || "";
            if (responseText) {
               lastErr = null;
               break; // Success
            }
          } catch (err) {
            console.error(`Model ${model} failed:`, err);
            lastErr = err;
          }
        }
        if (lastErr) throw lastErr;
        if (!responseText) throw new Error("Không nhận được dữ liệu trả về hợp lệ từ API.");
        return { text: responseText, model: successModel };
      };

      // STEP 1: Phân tích Role & Objective
      setStepsStatus(s => ({ ...s, step1: 'processing' }));
      let contentStep1: any;
      if (activeTab === 'text') {
        contentStep1 = [
          { text: "Nhiệm vụ: Dựa trên ý tưởng sau, hãy xác định chuyên gia phù hợp (Role) và mục tiêu cốt lõi (Objective) cho AI. Trả về định dạng Markdown với 2 mục: '## 1. Role' và '## 2. Objective'." },
          { text: `Ý tưởng: "${textInput}"` }
        ];
      } else {
        const base64Data = selectedImage!.split(',')[1];
        contentStep1 = {
           parts: [
             { inlineData: { mimeType: imageMimeType || "image/png", data: base64Data } },
             { text: `Nhiệm vụ: Dựa trên ý tưởng và hình ảnh sau, hãy xác định chuyên gia phù hợp (Role) và mục tiêu cốt lõi (Objective) cho AI. Trả về định dạng Markdown với 2 mục: '## 1. Role' và '## 2. Objective'.\nÝ tưởng bổ sung: "${textInput}"` }
           ]
        };
      }
      
      let s1Res = "";
      let finalModel = selectedModel;
      try {
        const r1 = await callApiWithRetry(contentStep1);
        s1Res = r1.text;
        finalModel = r1.model;
        setStepsStatus(s => ({ ...s, step1: 'completed', step2: 'processing' }));
      } catch (err: any) {
        setStepsStatus(s => ({ ...s, step1: 'error' }));
        throw err;
      }

      // STEP 2: Thiết lập Guidelines & Tone
      let s2Res = "";
      try {
        const contentStep2 = [
          { text: "Nhiệm vụ: Dựa trên thông tin Role và Objective sau đây, hãy viết ra Quy tắc & Hướng dẫn nghiệp vụ (Guidelines & Rules) và Phong cách giao tiếp (Tone & Persona) để bot không bị ảo tưởng hoặc lạc đề. Trả về định dạng Markdown với 2 mục: '## 3. Guidelines & Rules' và '## 4. Tone & Persona'." },
          { text: `Role & Objective:\n${s1Res}` }
        ];
        const r2 = await callApiWithRetry(contentStep2);
        s2Res = r2.text;
        finalModel = r2.model;
        setStepsStatus(s => ({ ...s, step2: 'completed', step3: 'processing' }));
      } catch (err: any) {
        setStepsStatus(s => ({ ...s, step2: 'error' }));
        throw err;
      }

      // STEP 3: Tổng hợp & Output Format
      let s3Res = "";
      try {
        const contentStep3 = [
          { text: "Nhiệm vụ: Dựa trên tất cả thông tin dưới đây, hãy tổng hợp lại thành một System Instruction hoàn chỉnh, mạch lạc. Bổ sung thêm phần '## 5. Output Format' quy định cấu trúc trả lời của bot (Markdown, chia cột, code block...). Đặt tiêu đề trên cùng '# Custom System Instruction: [Tên Role]'. Kết quả trả về phải là một tài liệu Markdown trọn vẹn." },
          { text: `Thông tin đầu vào:\n${s1Res}\n${s2Res}` }
        ];
        const r3 = await callApiWithRetry(contentStep3);
        s3Res = r3.text;
        finalModel = r3.model;
        setStepsStatus(s => ({ ...s, step3: 'completed' }));
      } catch (err: any) {
        setStepsStatus(s => ({ ...s, step3: 'error' }));
        throw err;
      }

      setGeneratedInstruction(s3Res);

      // History Save
      const titleLabel = textInput.trim() 
        ? (textInput.trim().length > 35 ? textInput.trim().slice(0, 35) + "..." : textInput.trim())
        : (activeTab === 'image' ? "Phân tích giao diện ảnh" : "Ý tưởng không tên");

      let finalModelLabel = 'Gemini 3 Flash';
      if (finalModel === 'gemini-3-pro-preview') finalModelLabel = 'Gemini 3 Pro';
      else if (finalModel === 'gemini-2.5-flash') finalModelLabel = 'Gemini 2.5 Flash';

      const newHistoryItem: HistoryItem = {
        id: Date.now().toString(),
        title: titleLabel,
        modelLabel: finalModelLabel,
        modelId: finalModel,
        inputType: activeTab,
        inputText: textInput,
        inputImage: activeTab === 'image' && selectedImage ? selectedImage : undefined,
        outputMarkdown: s3Res,
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' • ' + new Date().toLocaleDateString('vi-VN')
      };

      const updatedHistory = [newHistoryItem, ...history.slice(0, 19)];
      setHistory(updatedHistory);
      localStorage.setItem('ai_instruction_history', JSON.stringify(updatedHistory));

    } catch (error: any) {
      console.error(error);
      let friendlyError = "Có lỗi xảy ra trong quá trình gọi API. Vui lòng kiểm tra lại API Key, kết nối mạng và thử lại.";
      if (error?.message?.includes("API key not valid")) {
        friendlyError = "API Key của bạn không khả dụng hoặc bị nhập sai. Vui lòng nhấp vào Settings để thiết lập lại.";
      } else if (error?.message) {
        friendlyError = `Lỗi từ API: ${error.message}`; // Exact API error message as requested
      }
      setErrorMsg(friendlyError);
    } finally {
      setIsGenerating(false);
    }
  };

  const renderStepUI = (num: number, title: string, status: StepStatus) => {
    let icon, colorClass, textStatus;
    switch (status) {
      case 'waiting':
        icon = <Clock size={16} />;
        colorClass = "text-gray-400 bg-gray-50 border-gray-100";
        textStatus = "Đang chờ";
        break;
      case 'processing':
        icon = <Loader2 size={16} className="animate-spin text-amber-500" />;
        colorClass = "text-amber-700 bg-amber-50 border-amber-300 shadow-sm";
        textStatus = "Đang xử lý...";
        break;
      case 'completed':
        icon = <Check size={16} />;
        colorClass = "text-green-700 bg-green-50 border-green-300 shadow-sm";
        textStatus = "Hoàn tất";
        break;
      case 'error':
        icon = <X size={16} />;
        colorClass = "text-red-700 bg-red-50 border-red-300 shadow-sm";
        textStatus = "Đã dừng do lỗi";
        break;
    }
    
    return (
      <div className={`flex items-center justify-between p-3 rounded-xl border-2 transition-all ${colorClass}`}>
        <div className="flex items-center gap-3">
          <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${status==='completed'?'bg-green-200':status==='error'?'bg-red-200':status==='processing'?'bg-amber-200':'bg-gray-200'}`}>{num}</span>
          <span className="text-sm font-semibold">{title}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-bold">
          {icon}
          <span>{textStatus}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col min-h-screen w-full bg-[#F8F7FF] font-sans p-4 sm:p-6 text-gray-800">
      {/* Header Section */}
      <header className="flex flex-col md:flex-row items-center justify-between bg-white px-5 py-4 rounded-2xl shadow-sm border border-purple-100 gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center shadow-md shadow-purple-200">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-900 to-indigo-800 tracking-tight">AI System Instruction Generator</h1>
            <p className="text-[11px] text-purple-400 font-medium">Bản nâng cấp quy trình Multi-Agent</p>
          </div>
        </div>

        <div className="flex items-center bg-purple-50 p-1 rounded-xl border border-purple-100">
          <button onClick={() => setSelectedModel('gemini-3-flash-preview')} className={`px-3 py-2 text-xs font-semibold rounded-lg transition-all ${selectedModel === 'gemini-3-flash-preview' ? 'bg-white text-purple-700 shadow-sm border border-purple-100' : 'text-purple-500 hover:text-purple-700'}`}>Gemini 3 Flash (Def)</button>
          <button onClick={() => setSelectedModel('gemini-3-pro-preview')} className={`px-3 py-2 text-xs font-semibold rounded-lg transition-all ${selectedModel === 'gemini-3-pro-preview' ? 'bg-white text-purple-700 shadow-sm border border-purple-100' : 'text-purple-500 hover:text-purple-700'}`}>Gemini 3 Pro</button>
          <button onClick={() => setSelectedModel('gemini-2.5-flash')} className={`px-3 py-2 text-xs font-semibold rounded-lg transition-all ${selectedModel === 'gemini-2.5-flash' ? 'bg-white text-purple-700 shadow-sm border border-purple-100' : 'text-purple-500 hover:text-purple-700'}`}>Gemini 2.5 Flash</button>
        </div>

        <div className="flex flex-col items-center md:items-end gap-1">
          <button onClick={() => setShowApiModal(true)} className="flex items-center gap-2 px-4 py-2 bg-white border border-purple-200 rounded-lg text-purple-700 font-semibold text-sm shadow-sm hover:bg-purple-50 transition-all hover:border-purple-300">
            <Settings size={16} className="text-purple-600 animate-spin-slow" /> Settings
          </button>
          {apiKey ? (
            <span className="text-[10px] text-green-600 font-semibold bg-green-50 px-3 py-1 rounded-full border border-green-100 flex items-center gap-1 mt-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>Đã lưu API Key</span>
          ) : (
            <span className="text-[10px] text-red-600 font-semibold bg-red-50 px-3 py-1 rounded-full border border-red-100 flex items-center gap-1 mt-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse"></span>Lấy API key để sử dụng app</span>
          )}
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <section className="flex flex-col bg-white rounded-3xl shadow-md border border-purple-100 overflow-hidden min-h-[580px]">
          <div className="p-6 border-b border-purple-50">
            <h2 className="text-lg font-bold text-gray-800 mb-1 flex items-center gap-2"><Sparkles size={18} className="text-purple-600 animate-pulse" /> Multi-Step Agentic Prompting</h2>
            <p className="text-xs text-gray-400">Thiết kế cấu trúc bối cảnh hoàn chỉnh thông qua 3 bước phân tích chuyên sâu.</p>
            <div className="flex gap-4 border-b border-gray-100 mt-5">
              <button onClick={() => setActiveTab('text')} className={`pb-2 px-2 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${activeTab === 'text' ? 'text-purple-600 border-purple-600' : 'text-gray-400 hover:text-gray-600 border-transparent'}`}><FileText size={15} /> Nhập ý tưởng</button>
              <button onClick={() => setActiveTab('image')} className={`pb-2 px-2 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${activeTab === 'image' ? 'text-purple-600 border-purple-600' : 'text-gray-400 hover:text-gray-600 border-transparent'}`}><ImageIcon size={15} /> Phân tích ảnh</button>
            </div>
          </div>

          <div className="flex-1 p-6 flex flex-col justify-between gap-5">
            {activeTab === 'text' ? (
              <div className="flex-1 flex flex-col min-h-[220px]">
                <textarea value={textInput} onChange={(e) => setTextInput(e.target.value)} className="flex-1 w-full p-4 bg-purple-50/10 border border-purple-100 rounded-2xl resize-none focus:outline-none focus:ring-2 focus:ring-purple-200 text-sm placeholder:text-gray-400 text-gray-700 min-h-[160px]" placeholder="Viết ý tưởng của bạn vào đây..." />
              </div>
            ) : (
              <div className="flex-1 flex flex-col gap-4">
                <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} onPaste={handlePaste} onClick={() => fileInputRef.current?.click()} className={`flex-1 border-2 border-dashed rounded-3xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[180px] ${isDragging ? 'border-purple-600 bg-purple-50/50' : selectedImage ? 'border-purple-200 bg-purple-50/10 hover:border-purple-400' : 'border-purple-200 hover:border-purple-400 hover:bg-purple-50/20'}`}>
                  <input type="file" ref={fileInputRef} onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])} className="hidden" accept="image/*" />
                  {selectedImage ? (
                    <div className="relative group w-full max-w-[280px]">
                      <img src={selectedImage} alt="Preview" className="max-h-36 mx-auto rounded-xl object-contain shadow-md border border-purple-100" />
                      <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedImage(null); }} className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white p-1 rounded-full shadow-lg transition-transform hover:scale-110"><X size={14} /></button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center text-purple-600"><Upload size={22} className="animate-bounce" /></div>
                      <div>
                        <p className="text-sm font-semibold text-purple-950">Kéo thả ảnh tại đây hoặc click để tải lên</p>
                        <p className="text-xs text-gray-400 mt-1">Ctrl + V để dán ảnh trực tiếp</p>
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 tracking-wide block mb-1">Cung cấp thêm bối cảnh ngắn (Tùy chọn)</label>
                  <input type="text" value={textInput} onChange={(e) => setTextInput(e.target.value)} placeholder="Mô tả qua tác vụ..." className="w-full px-4 py-2.5 text-xs border border-purple-100 rounded-xl focus:outline-none focus:ring-1 focus:ring-purple-200" />
                </div>
              </div>
            )}

            {/* Footer references */}
      <footer className="mt-8 text-center text-xs text-gray-400 border-t border-purple-100/50 pt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="font-medium text-gray-500">
          APP được xây dựng bới <span className="font-bold text-purple-700">Mario Slide</span> (ZALO: <span className="font-bold text-indigo-600">0396.581.283</span>)
        </p>
        <div className="flex items-center gap-4">
          <p className="hidden sm:block">© 2026 AI System Instruction Generator</p>
          <a 
            href="https://ai.google.dev" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-purple-600 hover:text-purple-800 font-semibold flex items-center gap-1 transition-colors"
          >
            Google AI Dev Portal
            <ExternalLink size={11} />
          </a>
        </div>
      </footer>

            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 shadow-sm">
                <AlertCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
                <p className="text-sm text-red-800 font-semibold leading-normal">{errorMsg}</p>
              </div>
            )}

            <button onClick={handleGenerateInstruction} disabled={isGenerating} className={`w-full py-4 text-white font-bold rounded-2xl shadow-md transition-all active:scale-[0.98] ${isGenerating ? 'bg-gradient-to-r from-purple-400 to-indigo-400 cursor-not-allowed' : 'bg-gradient-to-r from-purple-600 to-indigo-600 cursor-pointer hover:shadow-purple-200 hover:shadow-lg hover:opacity-95'}`}>
              {isGenerating ? <span className="flex items-center justify-center gap-2"><Loader2 size={18} className="animate-spin" /> Đang khởi chạy quy trình Agent...</span> : "✨ TẠO SYSTEM INSTRUCTION"}
            </button>
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <div className="bg-[#1A1A2E] rounded-3xl shadow-xl p-6 border border-white/10 relative flex flex-col min-h-[420px] max-h-[580px]">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/5">
              <span className="text-white font-semibold flex items-center gap-2 text-sm">
                <span className={`w-2.5 h-2.5 rounded-full ${isGenerating ? 'bg-amber-400 animate-ping' : 'bg-green-400'}`}></span>
                {isGenerating ? 'Tiến trình khởi tạo...' : 'Kết quả System Instruction'}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={handleExportWord} className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-3 py-1.5 rounded-lg border border-indigo-200 flex items-center gap-2 transition-all font-semibold"><FileText size={14} /> Xuất Word</button>
                <button onClick={handleCopyText} className="text-xs bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-2 transition-all font-semibold">{copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}</button>
              </div>
            </div>

            {isGenerating || stepsStatus.step1 !== 'waiting' ? (
              <div className="flex flex-col gap-4 mb-4">
                {renderStepUI(1, "Phân tích Role & Objective", stepsStatus.step1)}
                {renderStepUI(2, "Thiết lập Guidelines & Tone", stepsStatus.step2)}
                {renderStepUI(3, "Tổng hợp & Định dạng Form", stepsStatus.step3)}
              </div>
            ) : null}

            <div className="flex-1 overflow-y-auto text-sm text-gray-300 font-mono space-y-4 pr-1 scrollbar-thin scrollbar-thumb-white/10 mt-2">
              <div className="prose prose-invert prose-purple max-w-none text-gray-200">
                <ReactMarkdown 
                  components={{
                    h1: ({node, ...props}) => <h1 className="text-base font-extrabold text-purple-300 border-b border-purple-900 pb-1 mt-4 mb-2" {...props} />,
                    h2: ({node, ...props}) => <h2 className="text-xs font-bold text-sky-300 mt-3 mb-1" {...props} />,
                    h3: ({node, ...props}) => <h3 className="text-xs font-semibold text-purple-200 mt-2" {...props} />,
                    p: ({node, ...props}) => <p className="text-xs text-gray-300 leading-relaxed mb-2" {...props} />,
                    ul: ({node, ...props}) => <ul className="list-disc ml-4 space-y-0.5 text-xs text-gray-300 mb-2" {...props} />,
                    ol: ({node, ...props}) => <ol className="list-decimal ml-4 space-y-0.5 text-xs text-gray-300 mb-2" {...props} />,
                    li: ({node, ...props}) => <li className="text-xs text-gray-300" {...props} />,
                    code: ({node, ...props}) => <code className="bg-white/5 text-purple-300 px-1 rounded font-mono text-[11px]" {...props} />,
                    pre: ({node, ...props}) => <pre className="bg-black/40 p-2.5 rounded-lg border border-white/5 text-[11px] overflow-x-auto my-2" {...props} />
                  }}
                >{generatedInstruction}</ReactMarkdown>
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#1A1A2E] to-transparent rounded-b-3xl pointer-events-none"></div>
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-purple-100 p-5 flex flex-col h-48">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-xs font-extrabold text-gray-500 uppercase tracking-widest flex items-center gap-2"><History size={14} className="text-purple-600" /> Lịch sử lưu cục bộ</h3>
              {history.length > 0 && <button onClick={() => { if(window.confirm("Bạn có chắc chắn muốn xóa toàn bộ lịch sử?")){setHistory([]);localStorage.removeItem('ai_instruction_history');} }} className="text-[10px] text-red-500 hover:text-red-700 font-bold transition-all px-2 py-1 bg-red-50 hover:bg-red-100 rounded-lg">Xóa tất cả</button>}
            </div>
            <div className="flex-1 overflow-y-auto pr-1 space-y-2.5 scrollbar-thin">
              {history.length > 0 ? history.map((item) => (
                <div key={item.id} onClick={() => { setActiveTab(item.inputType); setTextInput(item.inputText); setSelectedImage(item.inputImage || null); setGeneratedInstruction(item.outputMarkdown); setSelectedModel(item.modelId); setErrorMsg(null); }} className="flex items-center justify-between p-2.5 bg-purple-50/40 hover:bg-purple-100/50 rounded-xl border border-purple-100/40 transition-all cursor-pointer group">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center text-purple-700 shrink-0">{item.inputType === 'text' ? <FileText size={13} /> : <ImageIcon size={13} />}</div>
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-purple-950 truncate block max-w-[200px] sm:max-w-xs">{item.title}</span>
                      <span className="text-[9px] text-purple-400 block mt-0.5">{item.timestamp} • {item.modelLabel}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={(e) => { e.stopPropagation(); const f = history.filter(i => i.id !== item.id); setHistory(f); localStorage.setItem('ai_instruction_history', JSON.stringify(f)); }} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={13} /></button>
                    <ChevronRight size={14} className="text-purple-300 group-hover:text-purple-600 transition-colors" />
                  </div>
                </div>
              )) : <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 py-4"><Clock size={20} className="text-gray-300 mb-1" /><p className="text-xs">Chưa có bản ghi nào</p></div>}
            </div>
          </div>
        </section>
      </main>

      {/* Footer references */}
      <footer className="mt-8 text-center text-xs text-gray-400 border-t border-purple-100/50 pt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="font-medium text-gray-500">
          APP được xây dựng bới <span className="font-bold text-purple-700">Mario Slide</span> (ZALO: <span className="font-bold text-indigo-600">0396.581.283</span>)
        </p>
        <div className="flex items-center gap-4">
          <p className="hidden sm:block">© 2026 AI System Instruction Generator</p>
          <a 
            href="https://ai.google.dev" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-purple-600 hover:text-purple-800 font-semibold flex items-center gap-1 transition-colors"
          >
            Google AI Dev Portal
            <ExternalLink size={11} />
          </a>
        </div>
      </footer>

      {showApiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-purple-100 overflow-hidden transform transition-all p-6">
            <div className="flex justify-between items-center mb-4">
              <span className="text-base font-bold text-purple-900 flex items-center gap-2"><Settings className="text-purple-600" size={18} /> Cài đặt Google Gemini API Key</span>
              <button onClick={() => setShowApiModal(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed mb-4">API key sẽ được lưu trữ an toàn trong kho nhớ cục bộ của trình duyệt.</p>
            <div className="relative mb-4">
              <input type={showApiKeyText ? 'text' : 'password'} value={apiInput} onChange={(e) => setApiInput(e.target.value)} placeholder="Nhập Google Gemini API Key (AIzaSy...)" className="w-full px-4 py-3 bg-purple-50/20 border border-purple-150 rounded-xl text-xs text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-200" />
              <button onClick={() => setShowApiKeyText(!showApiKeyText)} className="absolute right-3.5 top-3.5 text-gray-400 hover:text-purple-600">{showApiKeyText ? <EyeOff size={15} /> : <Eye size={15} />}</button>
            </div>
            <div className="flex items-center gap-2 mb-6 bg-amber-50 border border-amber-100 p-2.5 rounded-xl">
              <Info size={14} className="text-amber-600 mt-0.5 shrink-0" />
              <p className="text-[10px] text-amber-800 leading-normal">Truy cập <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" className="underline font-bold text-purple-700 hover:text-purple-800">Google AI Studio</a> để tạo key miễn phí.</p>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowApiModal(false)} className="px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-600 font-semibold text-xs rounded-xl">Đóng</button>
              <button onClick={handleSaveApiKey} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all shadow-purple-200">Lưu liên kết</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
