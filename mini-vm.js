const { NodeVM } = require('vm2');

// 創建一個新的 VM 實例
const vm = new NodeVM({
  sandbox: {},
  timeout: 1000 // 設置每個程序的最大運行時間為 1 秒
});

// 定義兩個程序
const program1 = `
  let counter = 0;
  setInterval(() => {
    counter++;
    console.log('Program 1 counter:', counter);
  }, 1000);
`;

const program2 = `
  let counter = 0;
  setInterval(() => {
    counter++;
    console.log('Program 2 counter:', counter);
  }, 1000);
`;

// 運行程序1，初始資源為 0%
let program1Interval = setInterval(() => {
  // 不執行任何操作，模擬 0% 資源
}, 1000);

// 運行程序2，初始資源為 100%
vm.run(program2);

// 在 10 秒後，將程序1的資源調整為 50%
setTimeout(() => {
  clearInterval(program1Interval);
  setInterval(() => {
    vm.run(program1);
  }, 2000); // 每 2 秒運行一次，模擬 50% 資源
}, 10000);
