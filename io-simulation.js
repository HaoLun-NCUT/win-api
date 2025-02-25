const readline = require('readline');

// 生成隨機英文單字的函數
function generateRandomWord() {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  let word = '';
  const wordLength = Math.floor(Math.random() * 10) + 1; // 單字長度在 1 到 10 之間
  for (let i = 0; i < wordLength; i++) {
    word += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  return word;
}

// 生成十個隨機英文單字
const words = Array.from({ length: 10 }, generateRandomWord);
console.log('生成的單字:', words.join(', '));

// 設置 readline 接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// 模擬鍵盤輸入
function simulateKeyboardInput(word, callback) {
  let index = 0;
  function typeChar() {
    if (index < word.length) {
      process.stdout.write(word[index]);
      index++;
      setTimeout(typeChar, 500); // 每個字元間隔 0.5 秒
    } else {
      process.stdout.write('\n');
      callback();
    }
  }
  typeChar();
}

// 循環十次，模擬鍵盤輸入
let currentIndex = 0;
function askForWord() {
  if (currentIndex < words.length) {
    console.log(`請輸入單字 "${words[currentIndex]}" 或等待自動輸入:`);
    simulateKeyboardInput(words[currentIndex], () => {
      rl.question('', (input) => {
        if (input === words[currentIndex]) {
          console.log('輸入正確!');
        } else {
          console.log(`輸入錯誤! 正確的單字是: ${words[currentIndex]}`);
        }
        currentIndex++;
        askForWord();
      });
    });
  } else {
    console.log('所有單字已輸入完畢!');
    rl.close();
  }
}

// 開始詢問使用者輸入
askForWord();
