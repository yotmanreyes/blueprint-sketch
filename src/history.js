/* Undo and redo as a stack of plan snapshots. A plan is a few kilobytes of JSON,
   so whole-plan snapshots are simpler and safer than describing each edit. */
const History=(()=>{
  const LIMIT=100;

  function create(){
    let stack=[],index=-1;
    const snapshot=state=>JSON.stringify(state);
    return{
      reset(state){stack=[snapshot(state)];index=0;},
      // returns false when nothing changed since the last snapshot
      record(state){
        const s=snapshot(state);
        if(stack[index]===s)return false;
        stack=stack.slice(0,index+1);
        stack.push(s);
        if(stack.length>LIMIT)stack.shift();
        index=stack.length-1;
        return true;
      },
      peek:()=>index>=0?stack[index]:null,
      canUndo:()=>index>0,
      canRedo:()=>index>=0&&index<stack.length-1,
      undo(){if(index<=0)return null;index--;return JSON.parse(stack[index]);},
      redo(){if(index<0||index>=stack.length-1)return null;index++;return JSON.parse(stack[index]);}
    };
  }

  return{create,LIMIT};
})();
if(typeof module!=='undefined')module.exports=History;
