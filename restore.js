import fs from 'fs';
import readline from 'readline';

const logFiles = [
  'C:\\Users\\BRN\\.gemini\\antigravity\\brain\\498b4b8f-e1b4-473e-872d-81507bbcac5d\\.system_generated\\logs\\transcript.jsonl',
  'C:\\Users\\BRN\\.gemini\\antigravity\\brain\\e9c73a8c-e1c0-4097-bc4a-96946cabc3d5\\.system_generated\\logs\\transcript.jsonl',
  'C:\\Users\\BRN\\.gemini\\antigravity\\brain\\bb49c432-4d47-47b6-88ac-13c438696d21\\.system_generated\\logs\\transcript.jsonl'
];

// Helper to clean up line numbers like "1: import ..."
function cleanLineNumbers(text) {
  if (!text) return null;
  const lines = text.split('\n');
  const cleaned = lines.map(line => {
    // Matches patterns like " 12: code" or "12: code"
    const match = line.match(/^\s*\d+:(.*)$/);
    if (match) {
      return match[1];
    }
    return line;
  });
  
  let finalLines = cleaned;
  if (cleaned[0] && cleaned[0].includes('The following code has been modified')) {
    finalLines = cleaned.slice(1);
  }
  // Remove "The above content does NOT show..." footer
  if (finalLines[finalLines.length - 1] && finalLines[finalLines.length - 1].includes('The above content')) {
    finalLines = finalLines.slice(0, -1);
  }
  if (finalLines[finalLines.length - 2] && finalLines[finalLines.length - 2].includes('The above content')) {
    finalLines = finalLines.slice(0, -2);
  }
  return finalLines.join('\n');
}

function cleanArg(val) {
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      try {
        return JSON.parse(trimmed);
      } catch {
        // ignore
      }
    }
  }
  return val;
}

async function searchLog(logFile) {
  if (!fs.existsSync(logFile)) {
    console.log(`Log file ${logFile} does not exist.`);
    return { imageShaderContent: null, exportGifContent: null };
  }

  const fileStream = fs.createReadStream(logFile);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let imageShaderContent = null;
  let exportGifContent = null;

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      
      // Look for VIEW_FILE step
      if (obj.type === 'VIEW_FILE' && obj.status === 'DONE') {
        let filePath = obj.tool_calls?.[0]?.args?.AbsolutePath || '';
        let content = obj.content || '';
        
        filePath = cleanArg(filePath);
        
        if (filePath.includes('ImageShader.jsx')) {
          imageShaderContent = content;
        }
        if (filePath.includes('exportGif.js')) {
          exportGifContent = content;
        }
      }

      // Also look for write_to_file or replace_file_content tool calls in planner responses!
      if (obj.type === 'PLANNER_RESPONSE' && obj.tool_calls) {
        for (const tc of obj.tool_calls) {
          if (tc.name === 'write_to_file') {
            let filePath = tc.args?.TargetFile || '';
            let code = tc.args?.CodeContent || '';
            
            filePath = cleanArg(filePath);
            code = cleanArg(code);
            
            if (filePath.includes('ImageShader.jsx')) {
              imageShaderContent = code;
            }
            if (filePath.includes('exportGif.js')) {
              exportGifContent = code;
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  return { imageShaderContent, exportGifContent };
}

async function run() {
  let imageShader = null;
  let exportGif = null;

  // Search in reverse chronological order
  for (const logFile of logFiles) {
    console.log(`Searching log: ${logFile}...`);
    const { imageShaderContent, exportGifContent } = await searchLog(logFile);
    if (imageShaderContent && !imageShader) {
      imageShader = imageShaderContent;
      console.log(`-> Found ImageShader.jsx in ${logFile}`);
    }
    if (exportGifContent && !exportGif) {
      exportGif = exportGifContent;
      console.log(`-> Found exportGif.js in ${logFile}`);
    }
    if (imageShader && exportGif) break;
  }

  if (imageShader) {
    // If it has line numbers, clean them, otherwise write directly
    const cleaned = imageShader.includes('1: ') ? cleanLineNumbers(imageShader) : imageShader;
    fs.writeFileSync('src/components/ImageShader.jsx', cleaned);
    console.log("Restored src/components/ImageShader.jsx successfully!");
  } else {
    console.log("Could not find ImageShader.jsx content in any logs.");
  }

  if (exportGif) {
    const cleaned = exportGif.includes('1: ') ? cleanLineNumbers(exportGif) : exportGif;
    fs.writeFileSync('src/utils/exportGif.js', cleaned);
    console.log("Restored src/utils/exportGif.js successfully!");
  } else {
    console.log("Could not find exportGif.js content in any logs.");
  }
}

run();
