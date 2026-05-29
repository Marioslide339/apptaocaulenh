import { useState, useEffect, useRef, DragEvent, ClipboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import { 
  Settings, Sparkles, Upload, Copy, Check, History, Clock, ArrowRight, 
  AlertCircle, Eye, EyeOff, Image as ImageIcon, X, Info, Trash2, FileText, 
  ChevronRight, ExternalLink, Loader2, Brain, Lightbulb, Wand2
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

interface ImageFile {
  data: string;
  mimeType: string;
}

interface HistoryItem {
  id: string;
  title: string;
  modelLabel: string;
  modelId: string;
  inputType: 'text' | 'image';
  inputText: string;
  inputImages?: ImageFile[];
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
    name: "App kiểm tra bài cũ môn Toán lớp 10",
    text: "Ứng dụng giúp học sinh lớp 10 học kỳ I tự kiểm tra lại kiến thức cũ môn Toán qua hệ thống các câu hỏi trắc nghiệm ngắn, có giải đáp chi tiết, hài hước và thân thiện."
  },
  {
    name: "Công cụ quản lý chi tiêu cá nhân",
    text: "Chuyên gia tài chính thông minh đồng hành, lập kế hoạch ngân sách hàng tháng, đưa ra lời khuyên tiết kiệm cực đoan nhưng thực tế."
  },
  {
    name: "Game đoán từ tiếng Anh cho học sinh",
    text: "Trợ lý sáng tạo thiết kế trò chơi đố vui từ vựng tiếng Anh theo chủ đề, cấp độ từ vựng B1, cung cấp gợi ý và giải thích ngữ nghĩa vui nhộn."
  },
  {
    name: "Quiz trắc nghiệm Vật lý THPT",
    text: "Hệ thống tự động sinh ra các câu hỏi trắc nghiệm Vật lý dành cho học sinh thi THPT Quốc gia, bám sát chương trình cơ bản và nâng cao."
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
  
  const [selectedImages, setSelectedImages] = useState<ImageFile[]>([]);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isEnhancing, setIsEnhancing] = useState<boolean>(false);
  const [isSuggesting, setIsSuggesting] = useState<boolean>(false);

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

  const processFiles = (files: FileList | File[]) => {
    const newImages: ImageFile[] = [];
    let processedCount = 0;
    const filesToProcess = Array.from(files).slice(0, 10 - selectedImages.length);

    if (filesToProcess.length === 0) return;

    filesToProcess.forEach(file => {
      if (!file.type.startsWith('image/')) {
        processedCount++;
        if (processedCount === filesToProcess.length && newImages.length > 0) {
          setSelectedImages(prev => [...prev, ...newImages].slice(0, 10));
        }
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          newImages.push({ data: e.target.result as string, mimeType: file.type });
        }
        processedCount++;
        if (processedCount === filesToProcess.length) {
          setSelectedImages(prev => [...prev, ...newImages].slice(0, 10));
          setErrorMsg(null);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
      processFiles(e.clipboardData.files);
    }
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

  const callSimpleApi = async (prompt: string, setLoader: (val: boolean) => void) => {
    if (!apiKey) {
      setShowApiModal(true);
      setErrorMsg("Vui lòng thiết lập Gemini API Key trước khi sử dụng tính năng AI.");
      return;
    }
    if (!textInput.trim()) {
      setErrorMsg("Vui lòng nhập ý tưởng của bạn trước.");
      return;
    }
    setLoader(true);
    setErrorMsg(null);
    try {
        const ai = new GoogleGenAI({ apiKey, httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } });
        const result = await ai.models.generateContent({
            model: selectedModel,
            contents: prompt
        });
        if (result.text) {
           setTextInput(result.text);
        }
    } catch (err: any) {
        setErrorMsg("Lỗi từ AI: " + err.message);
    } finally {
        setLoader(false);
    }
  };

  const handleEnhanceIdea = () => {
    callSimpleApi(
        `Nhiệm vụ: Dựa trên ý tưởng ngắn gọn sau đây, hãy viết lại sao cho chi tiết, rõ ràng và mạch lạc hơn để làm đầu vào cho việc thiết kế AI Prompt. Chỉ trả về đoạn văn bản ý tưởng đã được viết lại, KHÔNG cần thêm tiêu đề, KHÔNG cần giới thiệu, KHÔNG cần giải thích.\n\nÝ tưởng gốc: "${textInput}"`,
        setIsEnhancing
    );
  };

  const handleSuggestIdea = () => {
    callSimpleApi(
        `Nhiệm vụ: Dựa trên ý tưởng sau đây, hãy đóng vai là chuyên gia và bổ sung thêm các tính năng, góc nhìn, yêu cầu nâng cao mà người dùng có thể chưa nghĩ tới. Mở rộng ý tưởng nhưng giữ nguyên bản chất gốc. Chỉ trả về đoạn mô tả ý tưởng đã được mở rộng, KHÔNG cần thêm tiêu đề, KHÔNG cần giới thiệu, KHÔNG cần giải thích.\n\nÝ tưởng gốc: "${textInput}"`,
        setIsSuggesting
    );
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
    if (activeTab === 'image' && selectedImages.length === 0) {
      setErrorMsg("Vui lòng tải lên ít nhất một hình ảnh.");
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
      const modelsToTry = [selectedModel, ...fallbackList.filter(m => m !== selectedModel)];

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
               break; 
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

      setStepsStatus({ step1: 'processing', step2: 'waiting', step3: 'waiting' });
      
      let contentCombined: any;
      if (activeTab === 'text') {
        contentCombined = [
          { text: `Nhiệm vụ: Dựa trên ý tưởng sau, hãy phân tích và thiết kế một System Instruction chuyên nghiệp cho bot AI.
Yêu cầu bắt buộc phải chia tài liệu Markdown làm 3 phần rõ ràng:
1. Xác định chuyên gia phù hợp (Role) và mục tiêu cốt lõi (Objective). (Ghi tiêu đề '## 1. Role' và '## 2. Objective')
2. Xây dựng Quy tắc & Hướng dẫn nghiệp vụ (Guidelines) và Phong cách giao tiếp (Tone). (Ghi tiêu đề '## 3. Guidelines & Rules' và '## 4. Tone & Persona')
3. Tổng hợp lại cấu trúc đầu ra hoàn chỉnh. (Ghi tiêu đề '## 5. Output Format')

Đặt tiêu đề trên cùng là '# Custom System Instruction: [Tên Role]'.
Ý tưởng của tôi: "${textInput}"` }
        ];
      } else {
        const imageParts = selectedImages.map(img => ({
          inlineData: {
            mimeType: img.mimeType || "image/png",
            data: img.data.split(',')[1],
          }
        }));
        contentCombined = {
           parts: [
             ...imageParts,
             { text: `Nhiệm vụ: Dựa trên các hình ảnh sau và ý tưởng bổ sung, hãy thiết kế một System Instruction chuyên nghiệp cho bot AI.
Yêu cầu bắt buộc phải chia tài liệu Markdown làm 3 phần rõ ràng:
1. Xác định chuyên gia phù hợp (Role) và mục tiêu cốt lõi (Objective). (Ghi tiêu đề '## 1. Role' và '## 2. Objective')
2. Xây dựng Quy tắc & Hướng dẫn nghiệp vụ (Guidelines) và Phong cách giao tiếp (Tone). (Ghi tiêu đề '## 3. Guidelines & Rules' và '## 4. Tone & Persona')
3. Tổng hợp lại cấu trúc đầu ra hoàn chỉnh. (Ghi tiêu đề '## 5. Output Format')

Đặt tiêu đề trên cùng là '# Custom System Instruction: [Tên Role]'.
Ý tưởng bổ sung: "${textInput}"` }
           ]
        };
      }
      
      let finalRes = "";
      let finalModel = selectedModel;

      try {
        let currentStep: 'step1'|'step2'|'step3' = 'step1';
        const timer1 = setTimeout(() => { currentStep = 'step2'; setStepsStatus(s => ({ ...s, step1: 'completed', step2: 'processing' })) }, 1500);
        const timer2 = setTimeout(() => { currentStep = 'step3'; setStepsStatus(s => ({ ...s, step2: 'completed', step3: 'processing' })) }, 3000);

        const res = await callApiWithRetry(contentCombined);
        
        clearTimeout(timer1);
        clearTimeout(timer2);

        finalRes = res.text;
        finalModel = res.model;
        setStepsStatus({ step1: 'completed', step2: 'completed', step3: 'completed' });
      } catch (err: any) {
        setStepsStatus(s => {
           const newS = { ...s };
           if (newS.step1 === 'processing') newS.step1 = 'error';
           else if (newS.step2 === 'processing') newS.step2 = 'error';
           else if (newS.step3 === 'processing') newS.step3 = 'error';
           return newS;
        });
        throw err;
      }

      setGeneratedInstruction(finalRes);

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
        inputImages: activeTab === 'image' ? selectedImages : undefined,
        outputMarkdown: finalRes,
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
        friendlyError = `Lỗi từ API: ${error.message}`; 
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
        icon = <Loader2 size={16} className="animate-spin text-indigo-500" />;
        colorClass = "text-indigo-700 bg-indigo-50 border-indigo-300 shadow-sm";
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
      <div className={`flex items-center justify-between p-3 rounded-xl border transition-all ${colorClass}`}>
        <div className="flex items-center gap-3">
          <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${status==='completed'?'bg-green-200':status==='error'?'bg-red-200':status==='processing'?'bg-indigo-200':'bg-gray-200'}`}>{num}</span>
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
      <header className="flex flex-col md:flex-row items-center justify-between bg-white px-5 py-4 rounded-2xl shadow-sm border border-indigo-100 gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-md shadow-indigo-200">
            <Sparkles size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-indigo-900 tracking-tight">Viết lệnh tạo APP chuyên nghiệp cùng Mario Slide - Bản nâng cấp</h1>
            <p className="text-[11px] text-indigo-400 font-medium">ZALO: 0396.581.283 ( Liên hệ để được tư vấn về khoá học và các dịch vụ soạn giảng AI )</p>
          </div>
        </div>

        <div className="flex items-center bg-indigo-50 p-1 rounded-xl border border-indigo-100">
          <button onClick={() => setSelectedModel('gemini-3-flash-preview')} className={`px-3 py-2 text-xs font-semibold rounded-lg transition-all ${selectedModel === 'gemini-3-flash-preview' ? 'bg-white text-indigo-700 shadow-sm border border-indigo-100' : 'text-indigo-500 hover:text-indigo-700'}`}>Gemini 3 Flash (Def)</button>
          <button onClick={() => setSelectedModel('gemini-3-pro-preview')} className={`px-3 py-2 text-xs font-semibold rounded-lg transition-all ${selectedModel === 'gemini-3-pro-preview' ? 'bg-white text-indigo-700 shadow-sm border border-indigo-100' : 'text-indigo-500 hover:text-indigo-700'}`}>Gemini 3 Pro</button>
          <button onClick={() => setSelectedModel('gemini-2.5-flash')} className={`px-3 py-2 text-xs font-semibold rounded-lg transition-all ${selectedModel === 'gemini-2.5-flash' ? 'bg-white text-indigo-700 shadow-sm border border-indigo-100' : 'text-indigo-500 hover:text-indigo-700'}`}>Gemini 2.5 Flash</button>
        </div>

        <div className="flex flex-col items-center md:items-end gap-1">
          <button onClick={() => setShowApiModal(true)} className="flex items-center gap-2 px-4 py-2 bg-white border border-indigo-200 rounded-lg text-indigo-700 font-semibold text-sm shadow-sm hover:bg-indigo-50 transition-all hover:border-indigo-300">
            <Settings size={16} className="text-indigo-600" /> Settings
          </button>
          {apiKey ? (
            <span className="text-[10px] text-green-600 font-semibold bg-green-50 px-3 py-1 rounded-full border border-green-100 flex items-center gap-1 mt-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>Đã lưu API Key</span>
          ) : (
            <span className="text-[10px] text-red-600 font-semibold bg-red-50 px-3 py-1 rounded-full border border-red-100 flex items-center gap-1 mt-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse"></span>Lấy API key để sử dụng app</span>
          )}
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <section className="flex flex-col min-h-[580px]">
          
          <div className="flex gap-2 bg-slate-100/80 p-1.5 rounded-xl mb-6 shadow-inner border border-slate-200/50">
            <button onClick={() => setActiveTab('text')} className={`flex-1 py-3 px-4 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'text' ? 'bg-white text-indigo-700 shadow-sm shadow-slate-200' : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'}`}><FileText size={16} /> Nhập ý tưởng</button>
            <button onClick={() => setActiveTab('image')} className={`flex-1 py-3 px-4 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'image' ? 'bg-white text-indigo-700 shadow-sm shadow-slate-200' : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'}`}><ImageIcon size={16} /> Phân tích từ ảnh</button>
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-indigo-50 p-6 flex-1 flex flex-col justify-between gap-5">
            {activeTab === 'text' ? (
              <div className="flex-1 flex flex-col gap-4">
                <textarea value={textInput} onChange={(e) => setTextInput(e.target.value)} className="w-full p-4 bg-white border border-slate-200 rounded-2xl resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 text-sm placeholder:text-gray-400 text-gray-700 min-h-[140px] shadow-sm" placeholder="Viết ý tưởng của bạn vào đây..." />
                
                <div className="flex flex-col gap-3 mt-1">
                  <button onClick={handleEnhanceIdea} disabled={isEnhancing || isGenerating || isSuggesting} className="w-full py-3.5 px-4 bg-[#34A853] hover:bg-[#2B8B44] text-white font-bold rounded-xl shadow-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-70 disabled:cursor-not-allowed">
                     {isEnhancing ? <Loader2 size={18} className="animate-spin" /> : <Brain size={18}/>}
                     Hoàn thiện ý tưởng với AI
                  </button>
                  <button onClick={handleSuggestIdea} disabled={isEnhancing || isGenerating || isSuggesting} className="w-full py-3.5 px-4 bg-[#E27602] hover:bg-[#B35E02] text-white font-bold rounded-xl shadow-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-70 disabled:cursor-not-allowed">
                     {isSuggesting ? <Loader2 size={18} className="animate-spin" /> : <Lightbulb size={18}/>}
                     Lấy gợi ý chuyên sâu từ AI
                  </button>
                  <button onClick={handleGenerateInstruction} disabled={isEnhancing || isGenerating || isSuggesting} className="w-full py-3.5 px-4 bg-[#6A52AC] hover:bg-[#56428C] text-white font-bold rounded-xl shadow-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-70 disabled:cursor-not-allowed">
                     {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Wand2 size={18}/>}
                     Tạo lệnh lên ai.studio
                  </button>
                </div>

                <div className="border-t border-slate-100 pt-5 mt-2">
                  <p className="text-xs font-semibold text-gray-500 mb-3">Ví dụ nhanh:</p>
                  <div className="flex flex-wrap gap-2">
                    {PRESETS.map((preset, index) => (
                      <button key={index} onClick={() => setTextInput(preset.text)} className="px-3 py-1.5 bg-slate-50 border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 rounded-full text-[11px] font-medium transition-all">
                        {preset.name}
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            ) : (
              <div className="flex-1 flex flex-col gap-4">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-bold text-gray-700 flex items-center gap-2"><ImageIcon size={16} className="text-indigo-500"/> Phân tích từ Ảnh</span>
                  <span className="text-xs font-semibold text-gray-400">({selectedImages.length}/10)</span>
                </div>
                
                <div 
                  onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} onPaste={handlePaste} 
                  className={`flex-1 border-2 border-dashed rounded-2xl p-6 text-center transition-all flex flex-col items-center justify-center min-h-[260px] relative ${
                    isDragging ? 'border-indigo-400 bg-indigo-50/50' : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50'
                  }`}
                >
                  <input type="file" ref={fileInputRef} onChange={(e) => e.target.files && processFiles(e.target.files)} className="hidden" accept="image/*" multiple />
                  
                  {selectedImages.length > 0 ? (
                    <div className="w-full h-full flex flex-col justify-between">
                      <div className="flex-1 overflow-y-auto mb-4 w-full">
                        <div className="flex flex-wrap gap-3 justify-center">
                            {selectedImages.map((img, idx) => (
                              <div key={idx} className="relative group w-20 h-20 sm:w-24 sm:h-24 rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                                <img src={img.data} className="w-full h-full object-cover" />
                                <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedImages(prev => prev.filter((_, i) => i !== idx)); }} className="absolute top-1 right-1 bg-white/90 text-red-500 p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"><X size={12}/></button>
                              </div>
                            ))}
                            {selectedImages.length < 10 && (
                              <button onClick={() => fileInputRef.current?.click()} className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors">
                                <Upload size={18}/>
                                <span className="text-[10px] mt-1 font-medium">Thêm ảnh</span>
                              </button>
                            )}
                        </div>
                      </div>
                      <p className="text-[11px] text-gray-400">Nhấn Ctrl+V để dán thêm ảnh từ clipboard</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-4 py-8">
                      <Upload size={32} className="text-indigo-300" />
                      <div>
                        <p className="text-sm font-bold text-gray-700">Kéo thả ảnh vào đây</p>
                        <p className="text-xs text-gray-400 mt-1">hoặc click để chọn file</p>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }} className="px-5 py-2.5 bg-white border border-indigo-100 rounded-xl text-indigo-600 text-xs font-semibold flex items-center gap-2 mt-2 shadow-sm hover:bg-indigo-50">
                        <Copy size={14}/> Ctrl+V để dán ảnh từ clipboard
                      </button>
                      <p className="text-[10px] text-gray-400 mt-4">Hỗ trợ: JPG, PNG, WebP, GIF (tối đa 10MB/ảnh, tối đa 10 ảnh)</p>
                    </div>
                  )}
                </div>

                {selectedImages.length > 0 && (
                  <div>
                    <label className="text-xs font-semibold text-gray-500 tracking-wide block mb-1">Cung cấp thêm bối cảnh ngắn (Tùy chọn)</label>
                    <input type="text" value={textInput} onChange={(e) => setTextInput(e.target.value)} placeholder="Mô tả qua tác vụ..." className="w-full px-4 py-3 text-xs border border-indigo-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-slate-50" />
                  </div>
                )}

                <button onClick={handleGenerateInstruction} disabled={isGenerating} className={`w-full mt-2 py-4 text-white font-bold rounded-2xl shadow-md transition-all active:scale-[0.98] ${isGenerating ? 'bg-indigo-300 cursor-not-allowed' : 'bg-[#92A3FD] hover:bg-[#7D91FA] cursor-pointer shadow-indigo-200 hover:shadow-lg'}`}>
                  {isGenerating ? <span className="flex items-center justify-center gap-2"><Loader2 size={18} className="animate-spin" /> Đang phân tích...</span> : <span className="flex items-center justify-center gap-2"><Sparkles size={18}/> Phân tích với AI</span>}
                </button>
              </div>
            )}

            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 shadow-sm mt-auto">
                <AlertCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
                <p className="text-sm text-red-800 font-semibold leading-normal">{errorMsg}</p>
              </div>
            )}
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
              <div className="prose prose-invert prose-indigo max-w-none text-gray-200">
                <ReactMarkdown 
                  components={{
                    h1: ({node, ...props}) => <h1 className="text-base font-extrabold text-indigo-300 border-b border-indigo-900 pb-1 mt-4 mb-2" {...props} />,
                    h2: ({node, ...props}) => <h2 className="text-xs font-bold text-sky-300 mt-3 mb-1" {...props} />,
                    h3: ({node, ...props}) => <h3 className="text-xs font-semibold text-indigo-200 mt-2" {...props} />,
                    p: ({node, ...props}) => <p className="text-xs text-gray-300 leading-relaxed mb-2" {...props} />,
                    ul: ({node, ...props}) => <ul className="list-disc ml-4 space-y-0.5 text-xs text-gray-300 mb-2" {...props} />,
                    ol: ({node, ...props}) => <ol className="list-decimal ml-4 space-y-0.5 text-xs text-gray-300 mb-2" {...props} />,
                    li: ({node, ...props}) => <li className="text-xs text-gray-300" {...props} />,
                    code: ({node, ...props}) => <code className="bg-white/5 text-indigo-300 px-1 rounded font-mono text-[11px]" {...props} />,
                    pre: ({node, ...props}) => <pre className="bg-black/40 p-2.5 rounded-lg border border-white/5 text-[11px] overflow-x-auto my-2" {...props} />
                  }}
                >{generatedInstruction}</ReactMarkdown>
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#1A1A2E] to-transparent rounded-b-3xl pointer-events-none"></div>
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-indigo-50 p-5 flex flex-col h-48">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-xs font-extrabold text-gray-500 uppercase tracking-widest flex items-center gap-2"><History size={14} className="text-indigo-500" /> Lịch sử lưu cục bộ</h3>
              {history.length > 0 && <button onClick={() => { if(window.confirm("Bạn có chắc chắn muốn xóa toàn bộ lịch sử?")){setHistory([]);localStorage.removeItem('ai_instruction_history');} }} className="text-[10px] text-red-500 hover:text-red-700 font-bold transition-all px-2 py-1 bg-red-50 hover:bg-red-100 rounded-lg">Xóa tất cả</button>}
            </div>
            <div className="flex-1 overflow-y-auto pr-1 space-y-2.5 scrollbar-thin">
              {history.length > 0 ? history.map((item) => (
                <div key={item.id} onClick={() => { setActiveTab(item.inputType); setTextInput(item.inputText); setSelectedImages(item.inputImages || []); setGeneratedInstruction(item.outputMarkdown); setSelectedModel(item.modelId); setErrorMsg(null); }} className="flex items-center justify-between p-2.5 bg-slate-50 hover:bg-indigo-50 rounded-xl border border-slate-100 transition-all cursor-pointer group">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-white shadow-sm border border-slate-200 flex items-center justify-center text-indigo-600 shrink-0">{item.inputType === 'text' ? <FileText size={13} /> : <ImageIcon size={13} />}</div>
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-gray-800 truncate block max-w-[200px] sm:max-w-xs">{item.title}</span>
                      <span className="text-[9px] text-gray-400 block mt-0.5">{item.timestamp} • {item.modelLabel}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={(e) => { e.stopPropagation(); const f = history.filter(i => i.id !== item.id); setHistory(f); localStorage.setItem('ai_instruction_history', JSON.stringify(f)); }} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={13} /></button>
                    <ChevronRight size={14} className="text-slate-300 group-hover:text-indigo-500 transition-colors" />
                  </div>
                </div>
              )) : <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 py-4"><Clock size={20} className="text-gray-300 mb-1" /><p className="text-xs">Chưa có bản ghi nào</p></div>}
            </div>
          </div>
        </section>
      </main>

      <footer className="mt-8 text-center text-xs text-gray-400 border-t border-indigo-100/50 pt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="font-medium text-gray-500">
          APP được xây dựng bới <span className="font-bold text-indigo-700">Mario Slide</span> (ZALO: <span className="font-bold text-indigo-600">0396.581.283</span>)
        </p>
        <div className="flex items-center gap-4">
          <p className="hidden sm:block">© 2026 AI System Instruction Generator</p>
          <a href="https://ai.google.dev" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 transition-colors">
            Google AI Dev Portal <ExternalLink size={11} />
          </a>
        </div>
      </footer>

      {showApiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-indigo-100 overflow-hidden transform transition-all p-6">
            <div className="flex justify-between items-center mb-4">
              <span className="text-base font-bold text-indigo-900 flex items-center gap-2"><Settings className="text-indigo-600" size={18} /> Cài đặt Google Gemini API Key</span>
              <button onClick={() => setShowApiModal(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed mb-4">API key sẽ được lưu trữ an toàn trong kho nhớ cục bộ của trình duyệt.</p>
            <div className="relative mb-4">
              <input type={showApiKeyText ? 'text' : 'password'} value={apiInput} onChange={(e) => setApiInput(e.target.value)} placeholder="Nhập Google Gemini API Key (AIzaSy...)" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              <button onClick={() => setShowApiKeyText(!showApiKeyText)} className="absolute right-3.5 top-3.5 text-gray-400 hover:text-indigo-600">{showApiKeyText ? <EyeOff size={15} /> : <Eye size={15} />}</button>
            </div>
            <div className="flex items-center gap-2 mb-6 bg-amber-50 border border-amber-100 p-2.5 rounded-xl">
              <Info size={14} className="text-amber-600 mt-0.5 shrink-0" />
              <p className="text-[10px] text-amber-800 leading-normal">Truy cập <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" className="underline font-bold text-indigo-700 hover:text-indigo-800">Google AI Studio</a> để tạo key miễn phí.</p>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowApiModal(false)} className="px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-600 font-semibold text-xs rounded-xl">Đóng</button>
              <button onClick={handleSaveApiKey} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all shadow-indigo-200">Lưu liên kết</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
