new Cat({
    el: '#cat',
    data: {
        journals: [],
        activeJournal: null
    },
    methods: {
        toggleSidebar() {
            let sidebarStyle = getComputedStyle(this.$refs.sidebar)
            if(sidebarStyle.display === 'block') {
                this.$refs.sidebar.style.display = 'none'
            } else {
                this.$refs.sidebar.style.display = 'block'
            }
        }
    },
    created() {
        for(var i=0; i<=100; i++)
        this.journals.push({
            id: i,
            name: 'Journal ' + i
        })
    }
})
