const test = require('express');
const mongoose = require('mongoose');
const { readFile } = require('fs');

const userSchema = mongoose.Schema({
    name:String,
    age: Number
})
mongoose.model("User",userSchema);
const apps = new test()
apps.get('/new-investor',(req,res)=>{
    readFile('./index.html','utf-8', (err, file)=>{
        if(err){
            res.status(500).send('sorry,out of order');
        }
        res.send(file);

    });
});
apps.listen(3000);